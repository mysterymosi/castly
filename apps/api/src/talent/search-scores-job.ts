import { computeFreshnessScore } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { eq, max } from "drizzle-orm"

/** Handler name for the publish / completeness-write (and later nightly) projection score job. */
export const talentSearchScoresJob = "talent.search-scores"

/**
 * Writes the derived score columns on `talent_search`.
 * Quality, completeness, and responsiveness are copied from `talent_profiles`, where
 * their own jobs write them; freshness is computed here because it decays.
 * Projection columns belong to the DB triggers — this job never touches them.
 */
export async function runSearchScoresJob(db: Db, userId: string, now = new Date()) {
  const [profile] = await db
    .select({
      qualityScore: schema.talentProfiles.qualityScore,
      completenessScore: schema.talentProfiles.completenessScore,
      responsivenessScore: schema.talentProfiles.responsivenessScore,
      lastActiveAt: schema.users.lastActiveAt,
    })
    .from(schema.talentProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.talentProfiles.userId))
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)
  if (!profile) return null

  const [sections] = await db
    .select({ lastUpdatedAt: max(schema.portfolioSections.updatedAt) })
    .from(schema.portfolioSections)
    .where(eq(schema.portfolioSections.talentId, userId))

  const freshnessScore = computeFreshnessScore({
    lastActiveAt: profile.lastActiveAt,
    lastPortfolioUpdateAt: sections?.lastUpdatedAt ?? null,
    now,
  })

  await db
    .update(schema.talentSearch)
    .set({
      qualityScore: profile.qualityScore,
      completenessScore: profile.completenessScore,
      responsivenessScore: profile.responsivenessScore,
      freshnessScore: freshnessScore.toFixed(2),
    })
    .where(eq(schema.talentSearch.talentId, userId))

  return { freshnessScore }
}
