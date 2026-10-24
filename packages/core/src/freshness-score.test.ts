import { describe, expect, it } from "vitest"

import { computeFreshnessScore } from "./freshness-score.js"

const now = new Date("2026-10-23T12:00:00Z")
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

describe("computeFreshnessScore", () => {
  it("is 100 for activity right now and 0 with no signals", () => {
    expect(computeFreshnessScore({ lastActiveAt: now, lastPortfolioUpdateAt: now, now })).toBe(100)
    expect(computeFreshnessScore({ lastActiveAt: null, lastPortfolioUpdateAt: null, now })).toBe(0)
  })

  it("halves each component at its half-life", () => {
    expect(
      computeFreshnessScore({ lastActiveAt: null, lastPortfolioUpdateAt: daysAgo(30), now }),
    ).toBe(30)
    expect(
      computeFreshnessScore({ lastActiveAt: daysAgo(14), lastPortfolioUpdateAt: null, now }),
    ).toBe(20)
  })

  it("decays monotonically and treats future timestamps as now", () => {
    const recent = computeFreshnessScore({
      lastActiveAt: daysAgo(1),
      lastPortfolioUpdateAt: daysAgo(1),
      now,
    })
    const stale = computeFreshnessScore({
      lastActiveAt: daysAgo(90),
      lastPortfolioUpdateAt: daysAgo(90),
      now,
    })
    expect(recent).toBeGreaterThan(stale)
    expect(
      computeFreshnessScore({ lastActiveAt: daysAgo(-5), lastPortfolioUpdateAt: daysAgo(-5), now }),
    ).toBe(100)
  })
})
