import { RANKING_SETTINGS, rankingSettingProblem } from "@workspace/core"
import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type { RankingSettings, rankingSettingUpdateInput } from "@workspace/schema"
import { eq } from "drizzle-orm"
import type { z } from "zod"

import { clearRankingWeightsCache, RANKING_WEIGHTS_TTL_MS } from "../deck/ranking-weights.js"
import { AdminError } from "./errors.js"

/** Throws unless `value` is one the deck will use for `key`. */
export function assertRankingSetting(key: string, value: number) {
  const problem = rankingSettingProblem(key, value)
  if (problem) throw new AdminError(problem, "invalid_ranking_setting")
}

/** Every tunable deck setting with its stored value (null: the default applies) and who set it. */
export async function listRankingSettings(db: Db): Promise<RankingSettings> {
  const rows = await db
    .select({
      key: schema.rankingWeights.key,
      value: schema.rankingWeights.value,
      updatedBy: schema.users.email,
      updatedAt: schema.rankingWeights.updatedAt,
    })
    .from(schema.rankingWeights)
    .leftJoin(schema.users, eq(schema.users.id, schema.rankingWeights.updatedBy))
  const byKey = new Map(rows.map((r) => [r.key, r]))
  return {
    settings: RANKING_SETTINGS.map((setting) => {
      const row = byKey.get(setting.key)
      return {
        ...setting,
        value: row ? Number(row.value) : null,
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      }
    }),
    cacheSeconds: RANKING_WEIGHTS_TTL_MS / 1000,
  }
}

/**
 * Store a setting, or delete its row so the default applies. Drops this process's cached config
 * so the next deck here uses it at once; other API instances pick it up within the cache TTL.
 */
export async function updateRankingSetting(db: Db, adminId: string, input: z.output<typeof rankingSettingUpdateInput>) {
  if (input.value === null) {
    if (!RANKING_SETTINGS.some((s) => s.key === input.key)) {
      throw new AdminError(`Unknown setting ${input.key}`, "invalid_ranking_setting")
    }
    await db.delete(schema.rankingWeights).where(eq(schema.rankingWeights.key, input.key))
  } else {
    assertRankingSetting(input.key, input.value)
    const value = String(input.value)
    await db
      .insert(schema.rankingWeights)
      .values({ key: input.key, value, updatedBy: adminId })
      .onConflictDoUpdate({
        target: schema.rankingWeights.key,
        set: { value, updatedBy: adminId, updatedAt: new Date() },
      })
  }
  clearRankingWeightsCache()
  return listRankingSettings(db)
}
