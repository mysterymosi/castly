import { computeQualityScore } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { and, eq } from "drizzle-orm"

/** Handler name for the publish-time (and later nightly) quality job. Not a request-path score. */
export const talentQualityScoreJob = "talent.quality-score"

/**
 * Writes `talent_profiles.quality_score`.
 * Loads completeness, ready media, the showreel, and credits only.
 * Does not read follower counts or `talent_attributes` (sensitive fields stay out).
 * Verification tier stays `none` until M7 has a stored tier to pass in.
 */
export async function runQualityScoreJob(db: Db, userId: string) {
  const [profile] = await db
    .select({
      completenessScore: schema.talentProfiles.completenessScore,
      showreelMediaId: schema.talentProfiles.showreelMediaId,
    })
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)
  if (!profile) return null

  const media = await db
    .select({
      kind: schema.mediaAssets.kind,
      width: schema.mediaAssets.width,
      height: schema.mediaAssets.height,
    })
    .from(schema.mediaAssets)
    .where(
      and(eq(schema.mediaAssets.ownerId, userId), eq(schema.mediaAssets.status, "ready"))
    )

  const creditRows = await db
    .select({ id: schema.credits.id })
    .from(schema.credits)
    .where(eq(schema.credits.talentId, userId))

  const shortEdges = media.flatMap((row) => {
    if (row.kind !== "image" || !row.width || !row.height) return []
    return [Math.min(row.width, row.height)]
  })
  const meanImageShortEdge =
    shortEdges.length === 0
      ? 0
      : shortEdges.reduce((sum, edge) => sum + edge, 0) / shortEdges.length

  const score = computeQualityScore({
    completenessScore: Number(profile.completenessScore),
    readyMediaCount: media.length,
    meanImageShortEdge,
    hasShowreel: Boolean(profile.showreelMediaId),
    creditCount: creditRows.length,
    verificationTier: "none",
  })

  await db
    .update(schema.talentProfiles)
    .set({ qualityScore: score.toFixed(2) })
    .where(eq(schema.talentProfiles.userId, userId))

  return score
}
