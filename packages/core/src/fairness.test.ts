import { describe, expect, it } from "vitest"

import type { ScoredCandidate } from "./deck.js"
import {
  applyExposurePenalty,
  applyFairness,
  DEFAULT_FAIRNESS_CONFIG,
  fairnessConfigFromRows,
  injectExploration,
  isExplorationSlot,
  spaceForDiversity,
  type FairCandidate,
  type FairnessContext,
} from "./fairness.js"

const card = (talentId: string, fields: Partial<ScoredCandidate> = {}): ScoredCandidate => ({
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
  lifetimeImpressions: 1000,
  raisedHand: false,
  boost: 0,
  score: 1,
  reasons: [],
  components: {
    vertical: 0,
    geo: 0,
    quality: 0,
    freshness: 0,
    responsiveness: 0,
    role: 0,
    raisedHand: 0,
    boost: 0,
  },
  ...fields,
})

const fair = (c: ScoredCandidate): FairCandidate => ({ ...c, exposurePenalty: 0, explored: false })

const context = (config: Partial<FairnessContext["config"]> = {}): FairnessContext => ({
  config: { ...DEFAULT_FAIRNESS_CONFIG, ...config },
  seed: 7,
  exposureThreshold: 100,
})

describe("applyExposurePenalty", () => {
  it("cuts an over-exposed score in proportion, up to the maximum, and records it", () => {
    const [over, , capped] = applyExposurePenalty(
      [card("over", { score: 2, impressions7d: 150 }), card("fine", { score: 1.5 }), card("capped", { score: 1, impressions7d: 1000 })],
      context(),
    )
    // 1.5× the threshold: strength 0.25 × 0.5 over = a 12.5% cut.
    expect(over).toMatchObject({ talentId: "over", score: 1.75, exposurePenalty: 0.25 })
    expect(over!.reasons).toEqual([{ code: "exposure", contribution: -0.25 }])
    // 10× the threshold: capped at 25%.
    expect(capped).toMatchObject({ score: 0.75, exposurePenalty: 0.25 })
  })

  it("never penalises below the minimum, even when the platform threshold is 0", () => {
    const [quiet] = applyExposurePenalty([card("quiet", { impressions7d: 15 })], {
      ...context(),
      exposureThreshold: 0,
    })
    expect(quiet!.exposurePenalty).toBe(0)
  })

  it("re-sorts by the penalised score", () => {
    const out = applyExposurePenalty(
      [card("a", { score: 2, impressions7d: 1000 }), card("b", { score: 1.6 })],
      context(),
    )
    expect(out.map((c) => c.talentId)).toEqual(["b", "a"])
  })
})

describe("injectExploration", () => {
  it("reserves every fifth slot at 20%", () => {
    const slots = Array.from({ length: 10 }, (_, i) => isExplorationSlot(i, 0.2))
    expect(slots).toEqual([false, false, false, false, true, false, false, false, false, true])
  })

  it("puts the under-seen talents into exploration slots and keeps everyone", () => {
    const ranked = Array.from({ length: 10 }, (_, i) =>
      fair(card(`t${i}`, { score: 10 - i, lifetimeImpressions: i === 9 ? 0 : 1000 })),
    )
    const out = injectExploration(ranked, context())
    expect(out).toHaveLength(10)
    // The lowest decile of 10 is one talent: t9, never seen, moves from last to slot 5.
    expect(out[4]).toMatchObject({ talentId: "t9", explored: true })
    expect(out[4]!.reasons).toEqual([{ code: "exploration", contribution: 0 }])
    expect(out.filter((c) => c.explored)).toHaveLength(1)
  })

  it("never demotes a drawn talent whose score already ranks it early", () => {
    const ranked = Array.from({ length: 10 }, (_, i) =>
      fair(card(`t${i}`, { score: 10 - i, lifetimeImpressions: i === 1 ? 0 : 1000 })),
    )
    const out = injectExploration(ranked, context())
    expect(out.map((c) => c.talentId)).toEqual(ranked.map((c) => c.talentId))
    expect(out[1]).toMatchObject({ talentId: "t1", explored: false })
  })
})

describe("spaceForDiversity", () => {
  it("breaks a run longer than the maximum with the next card that differs", () => {
    const lagos = { cityId: "lagos" }
    const sequence = [
      ...["a", "b", "c", "d"].map((id) => fair(card(id, { ...lagos, categoryIds: ["actors"] }))),
      fair(card("e", { cityId: "abuja", categoryIds: ["models"] })),
    ]
    expect(spaceForDiversity(sequence, DEFAULT_FAIRNESS_CONFIG).map((c) => c.talentId)).toEqual([
      "a",
      "b",
      "c",
      "e",
      "d",
    ])
  })

  it("spaces cards from the same agency", () => {
    const sequence = ["a", "b", "c", "d", "e"].map((id, i) =>
      fair(card(id, { cityId: `city-${i}`, agencyId: i < 4 ? "agency-1" : null })),
    )
    expect(spaceForDiversity(sequence, DEFAULT_FAIRNESS_CONFIG).map((c) => c.talentId)).toEqual([
      "a",
      "b",
      "c",
      "e",
      "d",
    ])
  })

  it("keeps the order when nothing in the window can break the run", () => {
    const sequence = ["a", "b", "c", "d", "e"].map((id) => fair(card(id, { categoryIds: ["actors"] })))
    expect(spaceForDiversity(sequence, DEFAULT_FAIRNESS_CONFIG).map((c) => c.talentId)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ])
  })

  it("doesn't reach past the window", () => {
    const sequence = [
      ...["a", "b", "c", "d"].map((id) => fair(card(id, { categoryIds: ["actors"] }))),
      fair(card("e", { categoryIds: ["models"] })),
    ]
    const out = spaceForDiversity(sequence, { ...DEFAULT_FAIRNESS_CONFIG, diversityWindow: 1 })
    expect(out.map((c) => c.talentId)).toEqual(["a", "b", "c", "d", "e"])
  })
})

describe("applyFairness", () => {
  it("is deterministic for a seed", () => {
    const scored = Array.from({ length: 30 }, (_, i) =>
      card(`t${i}`, { score: 30 - i, lifetimeImpressions: i % 7 === 0 ? 0 : 500, categoryIds: ["actors"] }),
    )
    expect(applyFairness(scored, context())).toEqual(applyFairness(scored, context()))
  })
})

describe("fairnessConfigFromRows", () => {
  it("overrides defaults with in-range values only", () => {
    expect(
      fairnessConfigFromRows([
        { key: "exploration_fraction", value: 0.3 },
        { key: "exposure_percentile", value: 1.5 },
        { key: "diversity_max_run", value: 2 },
        { key: "diversity_window", value: 2.5 },
      ]),
    ).toEqual({ ...DEFAULT_FAIRNESS_CONFIG, explorationFraction: 0.3, diversityMaxRun: 2 })
  })
})
