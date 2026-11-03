import {
  fairnessConfigFromRows,
  rankingWeightsFromRows,
  type FairnessConfig,
  type RankingWeights,
} from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"

/** How long a read of `ranking_weights` serves (TECH_SPEC §7.2): an ops edit is live within this. */
export const RANKING_WEIGHTS_TTL_MS = 60_000

export type RankingConfig = { weights: RankingWeights; fairness: FairnessConfig }

let cached: { config: RankingConfig; at: number } | null = null

/**
 * The deck's tuning: stage 2's term weights and stage 3's fairness settings, both from
 * `ranking_weights` rows over the defaults, cached for 60 seconds.
 */
export async function loadRankingConfig(db: Pick<Db, "select">, now = Date.now()): Promise<RankingConfig> {
  if (cached && now - cached.at < RANKING_WEIGHTS_TTL_MS) return cached.config
  const config = rankingConfigFromRows(await loadRankingRows(db))
  cached = { config, at: now }
  return config
}

/** The stored `ranking_weights` rows, uncached. */
export async function loadRankingRows(db: Pick<Db, "select">) {
  return (
    await db
      .select({ key: schema.rankingWeights.key, value: schema.rankingWeights.value })
      .from(schema.rankingWeights)
  ).map((row) => ({ key: row.key, value: Number(row.value) }))
}

/** Settings from rows over the defaults; a later row for the same key wins. */
export function rankingConfigFromRows(rows: readonly { key: string; value: number }[]): RankingConfig {
  const latest = [...new Map(rows.map((row) => [row.key, row])).values()]
  return { weights: rankingWeightsFromRows(latest), fairness: fairnessConfigFromRows(latest) }
}

/** Drops the cached config, so the next read sees the table. For tests and the weights editor (5.10). */
export function clearRankingWeightsCache() {
  cached = null
}
