import type { TalentAttributeRow, TalentRecord } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import {
  cardConfigSchema,
  type CoreSectionType,
  readStoredPortfolioSection,
} from "@workspace/schema"
import { and, asc, desc, eq, sql } from "drizzle-orm"

type ProfileRow = typeof schema.talentProfiles.$inferSelect

/** Media ids referenced by section configs (hero, about, gallery, showreel, audio). */
export function sectionMediaIds(sections: { config: unknown }[]): string[] {
  const ids: string[] = []
  for (const section of sections) {
    const cfg = section.config as {
      mediaId?: string | null
      mediaIds?: string[]
    }
    if (cfg.mediaId) ids.push(cfg.mediaId)
    if (cfg.mediaIds) ids.push(...cfg.mediaIds)
  }
  return ids
}

/** Display text for a stored attribute value, or null when nothing is set. */
function attributeValue(row: {
  valueText: string | null
  valueNum: string | null
  valueBool: boolean | null
}): string | null {
  if (row.valueText?.trim()) return row.valueText.trim()
  if (row.valueNum !== null) return String(Number(row.valueNum))
  if (row.valueBool !== null) return row.valueBool ? "Yes" : "No"
  return null
}

/** List-section rows. Visibility rules are applied by `serializeTalent`, not here. */
async function loadContent(db: Db, userId: string): Promise<TalentRecord["content"]> {
  const credits = await db
    .select()
    .from(schema.credits)
    .where(eq(schema.credits.talentId, userId))
    .orderBy(asc(schema.credits.sort), sql`${schema.credits.year} desc nulls last`)

  const attributeRows = await db
    .select({
      label: schema.attributeDefinitions.label,
      tier: schema.attributeDefinitions.tier,
      isVisible: schema.talentAttributes.isVisible,
      valueText: schema.talentAttributes.valueText,
      valueNum: schema.talentAttributes.valueNum,
      valueBool: schema.talentAttributes.valueBool,
    })
    .from(schema.talentAttributes)
    .innerJoin(
      schema.attributeDefinitions,
      eq(schema.talentAttributes.definitionId, schema.attributeDefinitions.id)
    )
    .where(
      and(
        eq(schema.talentAttributes.talentId, userId),
        eq(schema.attributeDefinitions.active, true)
      )
    )
    .orderBy(asc(schema.attributeDefinitions.label))

  const skills = await db
    .select({ name: schema.skills.name })
    .from(schema.talentSkills)
    .innerJoin(schema.skills, eq(schema.talentSkills.skillId, schema.skills.id))
    .where(eq(schema.talentSkills.talentId, userId))
    .orderBy(asc(schema.skills.name))

  const languages = await db
    .select({ name: schema.languages.name, fluency: schema.talentLanguages.fluency })
    .from(schema.talentLanguages)
    .innerJoin(schema.languages, eq(schema.talentLanguages.languageId, schema.languages.id))
    .where(eq(schema.talentLanguages.talentId, userId))
    // Strongest first: native, fluent, conversational, basic.
    .orderBy(desc(schema.talentLanguages.fluency), asc(schema.languages.name))

  const accents = await db
    .select({ name: schema.accents.name })
    .from(schema.talentAccents)
    .innerJoin(schema.accents, eq(schema.talentAccents.accentId, schema.accents.id))
    .where(eq(schema.talentAccents.talentId, userId))
    .orderBy(asc(schema.accents.name))

  const availability = await db
    .select({ month: schema.talentAvailability.month, status: schema.talentAvailability.status })
    .from(schema.talentAvailability)
    .where(eq(schema.talentAvailability.talentId, userId))
    .orderBy(asc(schema.talentAvailability.month))

  return {
    credits: credits.map((c) => ({
      title: c.title,
      roleName: c.roleName,
      productionCompany: c.productionCompany,
      year: c.year,
      type: c.type,
      link: c.link,
      isSignature: c.isSignature,
      verified: c.verifiedAt !== null,
    })),
    attributes: attributeRows.flatMap((row): TalentAttributeRow[] => {
      const value = attributeValue(row)
      // `prohibited` cannot be stored (DB check); narrowing keeps the type honest.
      if (value === null || row.tier === "prohibited") return []
      return [{ label: row.label, value, isVisible: row.isVisible, tier: row.tier }]
    }),
    skills,
    languages,
    accents,
    availability,
  }
}

/**
 * Everything `serializeTalent` needs for one talent. Section configs are migrated to their
 * current version on read, so the version sent with them is the current one too — writes only
 * accept the current version.
 */
export async function loadTalentRecord(
  db: Db,
  profile: ProfileRow,
  completenessScore: number
): Promise<TalentRecord> {
  const userId = profile.userId
  const sections = await db
    .select()
    .from(schema.portfolioSections)
    .where(eq(schema.portfolioSections.talentId, userId))
    .orderBy(asc(schema.portfolioSections.position))

  const skillRows = await db
    .select({ skillId: schema.talentSkills.skillId })
    .from(schema.talentSkills)
    .where(eq(schema.talentSkills.talentId, userId))

  const rateRows = await db
    .select()
    .from(schema.talentRates)
    .where(eq(schema.talentRates.talentId, userId))

  const [city] = profile.cityId
    ? await db
        .select({ name: schema.cities.name })
        .from(schema.cities)
        .where(eq(schema.cities.id, profile.cityId))
        .limit(1)
    : []

  return {
    profile: {
      userId,
      slug: profile.slug,
      displayName: profile.displayName,
      headline: profile.headline,
      bio: profile.bio,
      cityId: profile.cityId,
      cityName: city?.name ?? null,
      cardConfig: cardConfigSchema.parse(profile.cardConfig ?? {}),
      status: profile.status,
      publishedAt: profile.publishedAt,
      quickStartCompletedAt: profile.quickStartCompletedAt,
      completenessScore,
      qualityScore: Number(profile.qualityScore),
      rateVisibility: profile.rateVisibility,
    },
    sections: sections.map((s) => {
      const current = readStoredPortfolioSection({
        type: s.type as CoreSectionType,
        schemaVersion: s.schemaVersion,
        config: s.config,
      })
      return {
        id: s.id,
        type: s.type as CoreSectionType,
        schemaVersion: current.schemaVersion,
        position: s.position,
        isVisible: s.isVisible,
        config: current.config,
      }
    }),
    skillIds: skillRows.map((r) => r.skillId),
    rates: rateRows.map((r) => ({
      kind: r.kind,
      amountMin: r.amountMin === null ? null : Number(r.amountMin),
      amountMax: r.amountMax === null ? null : Number(r.amountMax),
      currency: r.currency,
      negotiable: r.negotiable,
    })),
    content: await loadContent(db, userId),
  }
}
