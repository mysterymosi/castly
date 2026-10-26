import type { TalentRecord } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import {
  cardConfigSchema,
  type CoreSectionType,
  readStoredPortfolioSection,
} from "@workspace/schema"
import { asc, eq } from "drizzle-orm"

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
  }
}
