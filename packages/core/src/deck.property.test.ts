import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  boostContribution,
  maxOrganicScore,
  scoreCandidates,
  type DeckCandidate,
  type RankingWeights,
  type ScoringContext,
  type ScoringRequirement,
} from "./deck.js"

/** Property tests for stage 2's invariants (TECH_SPEC §22.2), over arbitrary inputs. */

const SENSITIVE_KEYS = ["complexion", "gender", "ethnicity", "waist_cm"]
const STANDARD_KEYS = ["languages", "height_cm", "visible_tattoos", "playing_age_min"]

const score = fc.double({ min: 0, max: 100, noNaN: true })
const weight = fc.double({ min: 0, max: 5, noNaN: true })
const id = fc.constantFrom("a", "b", "c", "d", "e")

const attributeValue = fc.oneof(
  fc.double({ min: 0, max: 250, noNaN: true }),
  fc.boolean(),
  fc.constantFrom("light", "medium", "deep", "yoruba", "igbo"),
  fc.array(fc.constantFrom("yoruba", "igbo", "hausa", "english"), { maxLength: 3 }),
)

const requirement = fc.oneof(
  fc
    .tuple(fc.double({ min: 0, max: 200, noNaN: true }), fc.double({ min: 0, max: 50, noNaN: true }))
    .map(([min, span]) => ({ min, max: min + span })),
  fc.record({ anyOf: fc.array(fc.constantFrom("light", "deep", "yoruba", "igbo"), { minLength: 1, maxLength: 3 }) }),
  fc.record({ equals: fc.boolean() }),
)

const requirements = fc.array(
  fc.oneof(
    fc.record({ key: fc.constantFrom(...STANDARD_KEYS), tier: fc.constant("standard" as const), requirement }),
    fc.record({ key: fc.constantFrom(...SENSITIVE_KEYS), tier: fc.constant("sensitive" as const), requirement }),
  ),
  { maxLength: 6 },
) as fc.Arbitrary<ScoringRequirement[]>

const weights: fc.Arbitrary<RankingWeights> = fc.record({
  vertical: weight,
  geo: weight,
  quality: weight,
  freshness: weight,
  responsiveness: weight,
  role: weight,
  raisedHand: weight,
  boostCapFraction: fc.double({ min: 0, max: 1, noNaN: true }),
})

const candidate: fc.Arbitrary<DeckCandidate> = fc.record({
  talentId: fc.uuid(),
  categoryIds: fc.array(id, { maxLength: 3 }),
  cityId: fc.option(id, { nil: null }),
  region: fc.option(id, { nil: null }),
  country: fc.constantFrom("NG", "GH"),
  qualityScore: score,
  freshnessScore: score,
  responsivenessScore: score,
  attributes: fc.dictionary(fc.constantFrom(...STANDARD_KEYS, ...SENSITIVE_KEYS), attributeValue),
  agencyId: fc.option(id, { nil: null }),
  impressions7d: fc.nat(1000),
  lifetimeImpressions: fc.nat(100000),
  raisedHand: fc.boolean(),
  boost: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 1e6, noNaN: true })),
})

const context: fc.Arbitrary<ScoringContext> = fc.record({
  weights,
  verticalWeights: fc.dictionary(id, fc.double({ min: 0, max: 1, noNaN: true })),
  booker: fc.record({
    cityId: fc.option(id, { nil: null }),
    region: fc.option(id, { nil: null }),
    country: fc.constantFrom("NG", "GH"),
  }),
  role: fc.option(fc.record({ briefed: fc.boolean(), requirements }), { nil: null }),
})

const withoutSensitive = (c: DeckCandidate): DeckCandidate => ({
  ...c,
  attributes: Object.fromEntries(
    Object.entries(c.attributes).filter(([key]) => !SENSITIVE_KEYS.includes(key)),
  ),
})

describe("stage 2 invariants", () => {
  it("never drops a candidate, however badly it misses the role", () => {
    fc.assert(
      fc.property(fc.array(candidate, { maxLength: 30 }), context, (candidates, ctx) => {
        const scored = scoreCandidates(candidates, ctx)
        expect(scored.map((c) => c.talentId).sort()).toEqual(candidates.map((c) => c.talentId).sort())
        for (const c of scored) {
          expect(Number.isFinite(c.score)).toBe(true)
          expect(c.components.role).toBeGreaterThanOrEqual(0)
        }
      }),
    )
  })

  it("lets sensitive attributes change no score without an active, briefed role", () => {
    const unbriefed = context.map((ctx) => ({
      ...ctx,
      role: ctx.role ? { ...ctx.role, briefed: false } : null,
    }))
    fc.assert(
      fc.property(candidate, unbriefed, (c, ctx) => {
        const [withAttrs] = scoreCandidates([c], ctx)
        const [without] = scoreCandidates([withoutSensitive(c)], ctx)
        expect(withAttrs!.score).toBe(without!.score)
        expect(withAttrs!.components).toEqual(without!.components)
      }),
    )
  })

  it("caps boost at its fraction of the organic maximum, and adds nothing at 0", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e9, noNaN: true }),
        weights,
        fc.boolean(),
        (boost, w, hasRole) => {
          const contribution = boostContribution(boost, w, hasRole)
          expect(contribution).toBeGreaterThanOrEqual(0)
          expect(contribution).toBeLessThanOrEqual(w.boostCapFraction * maxOrganicScore(w, hasRole) + 1e-9)
          expect(boostContribution(0, w, hasRole)).toBe(0)
        },
      ),
    )
  })

  it("holds the boost cap inside a full score", () => {
    fc.assert(
      fc.property(candidate, context, (c, ctx) => {
        const [maxed] = scoreCandidates([{ ...c, boost: Number.MAX_VALUE }], ctx)
        const cap = ctx.weights.boostCapFraction * maxOrganicScore(ctx.weights, ctx.role !== null)
        expect(maxed!.components.boost).toBeLessThanOrEqual(cap + 1e-9)
      }),
    )
  })
})
