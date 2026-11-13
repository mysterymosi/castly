import { portfolioSections, type TalentAttributeRow, type TalentRecord } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { cardConfigSchema } from "@workspace/schema"
import { and, asc, desc, eq, sql } from "drizzle-orm"

type ProfileRow = typeof schema.talentProfiles.$inferSelect

/** The kind of the talent's primary category, which picks their portfolio layout; null without one. */
export async function primaryCategoryKind(db: Db, userId: string) {
  const [row] = await db
    .select({ kind: schema.categories.kind })
    .from(schema.talentCategories)
    .innerJoin(schema.categories, eq(schema.talentCategories.categoryId, schema.categories.id))
    .where(eq(schema.talentCategories.talentId, userId))
    .orderBy(desc(schema.talentCategories.isPrimary), asc(schema.talentCategories.sort))
    .limit(1)
  return row?.kind ?? null
}

/** The talent's photos, Main first, in studio order. */
export async function loadPhotoMediaIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ mediaId: schema.talentPhotos.mediaId })
    .from(schema.talentPhotos)
    .where(eq(schema.talentPhotos.talentId, userId))
    .orderBy(asc(schema.talentPhotos.position))
  return rows.map((row) => row.mediaId)
}

/** Media a serialized talent shows: its sections' and its photos. */
export function talentMediaIds(talent: { sections: { config: unknown }[]; photoMediaIds: string[] }) {
  return [...new Set([...sectionMediaIds(talent.sections), ...talent.photoMediaIds])]
}

/** Media ids referenced by section configs (hero, about, showreel, audio). */
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

/** "dark_brown" → "Dark brown": option values are slugs. */
function optionLabel(value: string) {
  const text = value.replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Display text for a stored attribute value, or null when nothing is set. */
function attributeValue(row: {
  dataType: "text" | "number" | "boolean" | "select" | "multi_select"
  valueText: string | null
  valueNum: string | null
  valueBool: boolean | null
}): string | null {
  if (row.valueText?.trim()) {
    if (row.dataType === "select" || row.dataType === "multi_select")
      return row.valueText.split(",").map(optionLabel).join(", ")
    return row.valueText.trim()
  }
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
      dataType: schema.attributeDefinitions.dataType,
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
 * Everything `serializeTalent` needs for one talent. The sections are not stored: they are the
 * fixed layout for the talent's primary category (`portfolioSections`), with the showreel in place.
 */
export async function loadTalentRecord(
  db: Db,
  profile: ProfileRow,
  completenessScore: number
): Promise<TalentRecord> {
  const userId = profile.userId
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
    sections: portfolioSections(await primaryCategoryKind(db, userId), profile.showreelMediaId),
    photoMediaIds: await loadPhotoMediaIds(db, userId),
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
