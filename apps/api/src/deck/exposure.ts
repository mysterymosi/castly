import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm"

/** The exposure penalty's window (TECH_SPEC §7.3): impressions over the last 7 days. */
export const EXPOSURE_WINDOW_DAYS = 7

/** The platform threshold moves only when the nightly roll-up runs; re-reading it per deck is waste. */
export const EXPOSURE_THRESHOLD_TTL_MS = 10 * 60_000

type Reader = Pick<Db, "select">

const sinceWindow = sql`current_date - ${EXPOSURE_WINDOW_DAYS}::int`

/** 7-day and lifetime impressions per talent, from `talent_exposure_daily`. Missing means none. */
export async function candidateExposure(db: Reader, talentIds: string[]) {
  if (talentIds.length === 0) return new Map<string, { impressions7d: number; lifetime: number }>()
  const e = schema.talentExposureDaily
  const rows = await db
    .select({
      talentId: e.talentId,
      impressions7d: sql<number>`coalesce(sum(${e.impressions}) filter (where ${e.day} > ${sinceWindow}), 0)::int`,
      lifetime: sql<number>`sum(${e.impressions})::int`,
    })
    .from(e)
    .where(inArray(e.talentId, talentIds))
    .groupBy(e.talentId)
  return new Map(rows.map((row) => [row.talentId, row]))
}

/**
 * Each talent's managing agency for diversity spacing: the user behind its earliest active
 * `profile_delegates` grant (TECH_SPEC §11.2). A talent may have none.
 */
export async function managingAgencies(db: Reader, talentIds: string[]) {
  if (talentIds.length === 0) return new Map<string, string>()
  const d = schema.profileDelegates
  const rows = await db
    .select({
      talentId: d.talentId,
      agencyId: sql<string>`(array_agg(${d.delegateUserId} order by ${d.grantedAt}))[1]`,
    })
    .from(d)
    .where(and(inArray(d.talentId, talentIds), isNull(d.revokedAt)))
    .groupBy(d.talentId)
  return new Map(rows.map((row) => [row.talentId, row.agencyId]))
}

let cachedThreshold: { percentile: number; value: number; at: number } | null = null

/**
 * Platform-wide 7-day impressions at `percentile`, across every live talent (unseen ones count
 * as 0). Stage 3 penalises talents above it.
 */
export async function exposureThreshold(db: Reader, percentile: number, now = Date.now()) {
  if (
    cachedThreshold &&
    cachedThreshold.percentile === percentile &&
    now - cachedThreshold.at < EXPOSURE_THRESHOLD_TTL_MS
  ) {
    return cachedThreshold.value
  }
  const e = schema.talentExposureDaily
  const ts = schema.talentSearch
  const weekly = db
    .select({ talentId: e.talentId, seen: sql<number>`sum(${e.impressions})`.as("seen") })
    .from(e)
    .where(gt(e.day, sinceWindow))
    .groupBy(e.talentId)
    .as("weekly")
  const [row] = await db
    .select({
      value: sql<number | null>`percentile_cont(${percentile}::float8) within group (order by coalesce(${weekly.seen}, 0))`,
    })
    .from(ts)
    .leftJoin(weekly, eq(weekly.talentId, ts.talentId))
    .where(eq(ts.status, "live"))
  const value = Number(row?.value ?? 0)
  cachedThreshold = { percentile, value, at: now }
  return value
}

/** For tests: forget the cached threshold. */
export function clearExposureThresholdCache() {
  cachedThreshold = null
}
