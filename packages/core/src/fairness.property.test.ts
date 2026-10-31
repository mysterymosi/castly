import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { ScoredCandidate } from "./deck.js"
import {
  applyExposurePenalty,
  applyFairness,
  DEFAULT_FAIRNESS_CONFIG,
  drawExplorers,
  explorationEligible,
  injectExploration,
  isExplorationSlot,
  type FairnessConfig,
  type FairnessContext,
} from "./fairness.js"

/** Property tests for stage 3's invariants (TECH_SPEC §22.2), over arbitrary decks and configs. */

const zero = { vertical: 0, geo: 0, quality: 0, freshness: 0, responsiveness: 0, role: 0, raisedHand: 0, boost: 0 }
const value = fc.constantFrom("a", "b", "c")

const scored: fc.Arbitrary<ScoredCandidate> = fc.record({
  talentId: fc.uuid(),
  categoryIds: fc.array(value, { maxLength: 2 }),
  cityId: fc.option(value, { nil: null }),
  region: fc.constant(null),
  country: fc.constant("NG"),
  qualityScore: fc.constant(0),
  freshnessScore: fc.constant(0),
  responsivenessScore: fc.constant(0),
  attributes: fc.constant({}),
  agencyId: fc.option(value, { nil: null }),
  impressions7d: fc.nat(2000),
  lifetimeImpressions: fc.nat(50000),
  raisedHand: fc.constant(false),
  boost: fc.constant(0),
  score: fc.double({ min: 0, max: 10, noNaN: true }),
  reasons: fc.constant([]),
  components: fc.constant(zero),
})

/** A deck from stage 2: unique talents, best score first. */
const deck = fc
  .uniqueArray(scored, { selector: (c) => c.talentId, maxLength: 80 })
  .map((cards) => cards.sort((a, b) => b.score - a.score))

const config: fc.Arbitrary<FairnessConfig> = fc.record({
  exposurePercentile: fc.double({ min: 0, max: 1, noNaN: true }),
  exposureMinImpressions: fc.nat(100),
  exposurePenaltyStrength: fc.double({ min: 0, max: 5, noNaN: true }),
  exposurePenaltyMax: fc.double({ min: 0, max: 1, noNaN: true }),
  explorationFraction: fc.double({ min: 0, max: 1, noNaN: true }),
  explorationDecile: fc.double({ min: 0, max: 1, noNaN: true }),
  diversityMaxRun: fc.integer({ min: 1, max: 5 }),
  diversityWindow: fc.integer({ min: 1, max: 30 }),
})

const context: fc.Arbitrary<FairnessContext> = fc.record({
  config,
  seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  exposureThreshold: fc.nat(1000),
})

describe("stage 3 invariants", () => {
  it("returns every card exactly once: the penalty never empties or thins the deck", () => {
    fc.assert(
      fc.property(deck, context, (cards, ctx) => {
        const out = applyFairness(cards, ctx)
        expect(out.map((c) => c.talentId).sort()).toEqual(cards.map((c) => c.talentId).sort())
      }),
    )
  })

  it("keeps a sparse, entirely over-exposed pool whole, with scores above zero", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(scored, { selector: (c) => c.talentId, minLength: 1, maxLength: 5 }),
        context,
        (cards, ctx) => {
          const flooded = cards.map((c) => ({ ...c, score: c.score + 0.1, impressions7d: 1_000_000 }))
          const out = applyFairness(flooded, ctx)
          expect(out).toHaveLength(flooded.length)
          for (const c of out) expect(c.score).toBeGreaterThan(0)
        },
      ),
    )
  })

  it("meets the exploration fraction whenever enough under-seen talents are eligible", () => {
    fc.assert(
      fc.property(deck, context, (cards, ctx) => {
        const ranked = applyExposurePenalty(cards, ctx)
        const drawn = drawExplorers(ranked, ctx)
        const slots = Math.floor(cards.length * ctx.config.explorationFraction)
        const eligible = explorationEligible(ranked, ctx).length
        expect(drawn.size).toBe(Math.min(slots, eligible))

        // By each reserved slot, at least as many drawn talents are placed as slots have
        // passed: exploration fills its share as the deck is served, not just in total.
        const out = injectExploration(ranked, ctx)
        let placed = 0
        let reserved = 0
        out.forEach((c, i) => {
          if (drawn.has(c.talentId)) placed++
          if (isExplorationSlot(i, ctx.config.explorationFraction)) reserved++
          expect(placed).toBeGreaterThanOrEqual(Math.min(reserved, drawn.size))
        })
      }),
    )
  })

  it("explores only talents from the lowest lifetime-impression share", () => {
    fc.assert(
      fc.property(deck, context, (cards, ctx) => {
        const out = applyFairness(cards, ctx)
        const eligible = Math.ceil(cards.length * ctx.config.explorationDecile)
        const lowest = [...cards].map((c) => c.lifetimeImpressions).sort((a, b) => a - b)[eligible - 1]
        for (const c of out.filter((card) => card.explored)) {
          // Only drawn, under-seen talents are ever promoted.
          expect(c.lifetimeImpressions).toBeLessThanOrEqual(lowest!)
        }
      }),
    )
  })

  it("keeps the reasons summing to the score", () => {
    fc.assert(
      fc.property(deck, context, (cards, ctx) => {
        const withReasons = cards.map((c) => ({ ...c, reasons: [{ code: "quality" as const, contribution: c.score }] }))
        for (const c of applyFairness(withReasons, ctx)) {
          const sum = c.reasons.reduce((total, r) => total + r.contribution, 0)
          expect(sum).toBeCloseTo(c.score, 9)
        }
      }),
    )
  })

  it("leaves no run longer than the maximum when the defaults and a varied pool allow it", () => {
    // Every value appears at most once in each run-length window of input, so spacing can
    // always find a card that differs within its window.
    const varied = fc.integer({ min: 4, max: 40 }).map((n) =>
      Array.from({ length: n }, (_, i): ScoredCandidate => ({
        ...scoredBase(`t${i}`, n - i),
        categoryIds: [`cat-${i % 4}`],
        cityId: `city-${i % 5}`,
      })),
    )
    fc.assert(
      fc.property(varied, fc.integer({ min: 0, max: 1000 }), (cards, seed) => {
        const out = applyFairness(cards, { config: DEFAULT_FAIRNESS_CONFIG, seed, exposureThreshold: 0 })
        const max = DEFAULT_FAIRNESS_CONFIG.diversityMaxRun
        for (let i = max; i < out.length; i++) {
          const run = out.slice(i - max, i + 1)
          expect(run.every((c) => c.cityId === run[0]!.cityId)).toBe(false)
          expect(run.every((c) => c.categoryIds[0] === run[0]!.categoryIds[0])).toBe(false)
        }
      }),
    )
  })
})

function scoredBase(talentId: string, score: number): ScoredCandidate {
  return {
    talentId,
    categoryIds: [],
    cityId: null,
    region: null,
    country: "NG",
    qualityScore: 0,
    freshnessScore: 0,
    responsivenessScore: 0,
    attributes: {},
    agencyId: null,
    impressions7d: 0,
    lifetimeImpressions: 100,
    raisedHand: false,
    boost: 0,
    score,
    reasons: [],
    components: zero,
  }
}
