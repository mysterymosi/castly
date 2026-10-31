import { describe, expect, it } from "vitest"

import {
  applyFairness,
  DEFAULT_RANKING_WEIGHTS,
  geoProximity,
  rankingWeightsFromRows,
  requirementMatch,
  roleSoftMatch,
  scoreCandidate,
  scoreCandidates,
  UNKNOWN_MATCH,
  type DeckCandidate,
  type ScoringContext,
} from "./deck.js"

const candidate = (talentId: string, overrides: Partial<DeckCandidate> = {}): DeckCandidate => ({
  talentId,
  categoryIds: [],
  cityId: null,
  region: null,
  country: "NG",
  qualityScore: 0,
  freshnessScore: 0,
  responsivenessScore: 0,
  attributes: {},
  raisedHand: false,
  boost: 0,
  ...overrides,
})

const context = (overrides: Partial<ScoringContext> = {}): ScoringContext => ({
  weights: DEFAULT_RANKING_WEIGHTS,
  verticalWeights: {},
  booker: { cityId: "lagos", region: "south-west", country: "NG" },
  role: null,
  ...overrides,
})

describe("geoProximity", () => {
  const booker = context().booker
  it("ranks same city over same region over same country", () => {
    expect(geoProximity({ cityId: "lagos", region: "south-west", country: "NG" }, booker)).toEqual({
      value: 1,
      level: "city",
    })
    expect(geoProximity({ cityId: "ibadan", region: "south-west", country: "NG" }, booker).level).toBe(
      "region",
    )
    expect(geoProximity({ cityId: "abuja", region: "north-central", country: "NG" }, booker).level).toBe(
      "country",
    )
    expect(geoProximity({ cityId: "accra", region: null, country: "GH" }, booker).value).toBe(0)
  })
})

describe("requirementMatch", () => {
  it("scores a value inside a range 1 and decays outside it", () => {
    expect(requirementMatch({ min: 25, max: 32 }, 28)).toBe(1)
    // 10% of the bound (3.2 years) is the tolerance: two years over is still a partial match.
    expect(requirementMatch({ min: 25, max: 32 }, 34)).toBeCloseTo(0.375)
    expect(requirementMatch({ min: 25, max: 32 }, 45)).toBe(0)
  })

  it("matches option lists and flags", () => {
    expect(requirementMatch({ anyOf: ["yoruba", "igbo"] }, ["english", "yoruba"])).toBe(1)
    expect(requirementMatch({ anyOf: ["yoruba"] }, "hausa")).toBe(0)
    expect(requirementMatch({ equals: true }, true)).toBe(1)
    expect(requirementMatch({ equals: true }, false)).toBe(0)
  })

  it("treats an unknown value as neither a match nor a miss", () => {
    expect(requirementMatch({ anyOf: ["yoruba"] }, undefined)).toBe(UNKNOWN_MATCH)
  })
})

describe("roleSoftMatch", () => {
  const role = {
    briefed: false,
    requirements: [
      { key: "languages", tier: "standard" as const, requirement: { anyOf: ["yoruba"] } },
      { key: "complexion", tier: "sensitive" as const, requirement: { anyOf: ["deep"] } },
    ],
  }

  it("ignores sensitive requirements on an unbriefed role", () => {
    expect(roleSoftMatch({ languages: ["yoruba"], complexion: "light" }, role)).toEqual({
      value: 1,
      matched: ["languages"],
    })
  })

  it("averages every requirement on a briefed role", () => {
    expect(roleSoftMatch({ languages: ["yoruba"], complexion: "light" }, { ...role, briefed: true })).toEqual(
      { value: 0.5, matched: ["languages"] },
    )
  })
})

describe("scoreCandidate", () => {
  it("weights every term and records a reason for each one that contributed", () => {
    const scored = scoreCandidate(
      candidate("ada", {
        categoryIds: ["actors"],
        cityId: "lagos",
        region: "south-west",
        qualityScore: 80,
        freshnessScore: 50,
        attributes: { languages: ["yoruba"] },
      }),
      context({
        verticalWeights: { actors: 1 },
        role: {
          briefed: false,
          requirements: [{ key: "languages", tier: "standard", requirement: { anyOf: ["yoruba"] } }],
        },
      }),
    )
    const w = DEFAULT_RANKING_WEIGHTS
    expect(scored.components).toEqual({
      vertical: w.vertical,
      geo: w.geo,
      quality: w.quality * 0.8,
      freshness: w.freshness * 0.5,
      responsiveness: 0,
      role: w.role,
      raisedHand: 0,
      boost: 0,
    })
    expect(scored.score).toBeCloseTo(w.vertical + w.geo + w.quality * 0.8 + w.freshness * 0.5 + w.role)
    expect(scored.reasons).toEqual([
      { code: "vertical", contribution: w.vertical },
      { code: "geo", contribution: w.geo, detail: { level: "city" } },
      { code: "quality", contribution: w.quality * 0.8 },
      { code: "freshness", contribution: w.freshness * 0.5 },
      { code: "role", contribution: w.role, detail: { matched: ["languages"] } },
    ])
  })

  it("gives the role and raised-hand terms nothing without a role", () => {
    const scored = scoreCandidate(
      candidate("ada", { raisedHand: true, attributes: { languages: ["yoruba"] } }),
      context(),
    )
    expect(scored.components.role).toBe(0)
    expect(scored.components.raisedHand).toBe(0)
  })
})

describe("scoreCandidates", () => {
  it("keeps stage 1's order between tied candidates", () => {
    const seeded = ["d", "a", "c", "b"].map((id) => candidate(id, { qualityScore: 50 }))
    expect(scoreCandidates(seeded, context()).map((c) => c.talentId)).toEqual(["d", "a", "c", "b"])
  })

  it("passes the scored order through fairness unchanged for now", () => {
    const scored = scoreCandidates([candidate("a", { qualityScore: 10 }), candidate("b")], context())
    expect(applyFairness(scored)).toEqual(scored)
  })
})

describe("rankingWeightsFromRows", () => {
  it("overrides defaults with known, valid rows only", () => {
    expect(
      rankingWeightsFromRows([
        { key: "w_geo", value: 0.9 },
        { key: "w_quality", value: -1 },
        { key: "w_followers", value: 5 },
        { key: "boost_cap_fraction", value: 0.2 },
      ]),
    ).toEqual({ ...DEFAULT_RANKING_WEIGHTS, geo: 0.9, boostCapFraction: 0.2 })
  })
})
