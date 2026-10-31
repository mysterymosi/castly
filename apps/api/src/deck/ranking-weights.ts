import { rankingWeightsFromRows, type RankingWeights } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"

/** How long a read of `ranking_weights` serves (TECH_SPEC §7.2): an ops edit is live within this. */
export const RANKING_WEIGHTS_TTL_MS = 60_000

let cached: { weights: RankingWeights; at: number } | null = null

/** The deck's term weights: `ranking_weights` rows over the defaults, cached for 60 seconds. */
export async function loadRankingWeights(db: Pick<Db, "select">, now = Date.now()) {
  if (cached && now - cached.at < RANKING_WEIGHTS_TTL_MS) return cached.weights
  const rows = await db
    .select({ key: schema.rankingWeights.key, value: schema.rankingWeights.value })
    .from(schema.rankingWeights)
  const weights = rankingWeightsFromRows(rows.map((row) => ({ key: row.key, value: Number(row.value) })))
  cached = { weights, at: now }
  return weights
}

/** Drops the cached weights, so the next read sees the table. For tests and the weights editor (5.10). */
export function clearRankingWeightsCache() {
  cached = null
}
