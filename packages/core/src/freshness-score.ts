/**
 * Decaying recency signal for ranking (TECH_SPEC §7.5). Refreshed nightly and on publish,
 * so the decay is applied at job time, not read time.
 */
export type FreshnessScoreInput = {
  /** `users.last_active_at`. Null when the talent has never signed in since tracking began. */
  lastActiveAt: Date | null
  /** Most recent portfolio section write. Null when there are no sections. */
  lastPortfolioUpdateAt: Date | null
  now: Date
}

const WEIGHT = {
  portfolio: 60,
  activity: 40,
} as const

const portfolioHalfLifeDays = 30
const activityHalfLifeDays = 14
const dayMs = 24 * 60 * 60 * 1000

function decay(at: Date | null, now: Date, halfLifeDays: number) {
  if (!at) return 0
  const days = Math.max(0, (now.getTime() - at.getTime()) / dayMs)
  return Math.pow(0.5, days / halfLifeDays)
}

/** 0..100, two decimal places, matching `freshness_score` numeric(5,2). */
export function computeFreshnessScore(input: FreshnessScoreInput) {
  const portfolio =
    decay(input.lastPortfolioUpdateAt, input.now, portfolioHalfLifeDays) * WEIGHT.portfolio
  const activity = decay(input.lastActiveAt, input.now, activityHalfLifeDays) * WEIGHT.activity
  return Math.round((portfolio + activity) * 100) / 100
}
