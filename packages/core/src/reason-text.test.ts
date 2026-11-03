import { describe, expect, it } from "vitest"

import { DEFAULT_RANKING_WEIGHTS, scoreCandidate, type DeckCandidate, type ScoringContext } from "./deck.js"
import { applyFairness, DEFAULT_FAIRNESS_CONFIG } from "./fairness.js"
import { deckReasonText, type ReasonTextFacts } from "./reason-text.js"

const candidate = (overrides: Partial<DeckCandidate> = {}): DeckCandidate => ({
  talentId: "t1",
  categoryIds: ["actors"],
  cityId: null,
  region: null,
  country: "NG",
  qualityScore: 0,
  freshnessScore: 0,
  responsivenessScore: 0,
  attributes: {},
  agencyId: null,
  impressions7d: 0,
  lifetimeImpressions: 0,
  raisedHand: false,
  boost: 0,
  ...overrides,
})

const yorubaLead: ScoringContext = {
  weights: DEFAULT_RANKING_WEIGHTS,
  verticalWeights: { actors: 1 },
  booker: { cityId: "lagos", region: "south-west", country: "NG" },
  role: {
    briefed: false,
    requirements: [{ key: "languages", tier: "standard", requirement: { anyOf: ["yoruba"] } }],
  },
}

const facts = (overrides: Partial<ReasonTextFacts> = {}): ReasonTextFacts => ({
  cityName: "Lagos",
  matchedLanguages: [],
  matchedAccents: [],
  ...overrides,
})

const text = (c: DeckCandidate, ctx: ScoringContext, f = facts()) =>
  deckReasonText(scoreCandidate(c, ctx).reasons, f, ctx.weights)

describe("deckReasonText", () => {
  it("reads a Lagos Yoruba actress on a Yoruba role from the reasons scoring wrote", () => {
    const actress = candidate({ cityId: "lagos", region: "south-west", attributes: { languages: ["yoruba"] } })
    expect(text(actress, yorubaLead, facts({ matchedLanguages: ["Yoruba"] }))).toBe(
      "Speaks Yoruba · In Lagos · Matches your role",
    )
  })

  it("says nothing about the role when nothing on it matched fully", () => {
    const igbo = candidate({ cityId: "lagos", region: "south-west", attributes: { languages: ["igbo"] } })
    expect(text(igbo, yorubaLead)).toBe("In Lagos")
    // Unknown languages score 0.5 but aren't a match either.
    expect(text(candidate({ cityId: "lagos" }), yorubaLead)).toBe("In Lagos")
  })

  it("names only the visible values it's given, falling back to the role match", () => {
    const actress = candidate({ cityId: "lagos", attributes: { languages: ["yoruba"] } })
    expect(text(actress, yorubaLead, facts({ cityName: null }))).toBe("In your city · Matches your role")
  })

  it("uses region, and the strongest plain term only when it was strong", () => {
    const ibadan = candidate({ cityId: "ibadan", region: "south-west", qualityScore: 90, freshnessScore: 95 })
    expect(text(ibadan, { ...yorubaLead, role: null })).toBe("Near you · Strong portfolio")
    const weak = candidate({ cityId: "abuja", region: "north-central", qualityScore: 40, responsivenessScore: 50 })
    expect(text(weak, { ...yorubaLead, role: null })).toBe("In your country")
    expect(text(candidate({ country: "GH" }), { ...yorubaLead, role: null })).toBeNull()
  })

  it("always discloses a boost, and labels an exploration slot", () => {
    const boosted = candidate({ cityId: "lagos", attributes: { languages: ["yoruba"] }, boost: 0.2 })
    expect(text(boosted, yorubaLead, facts({ matchedLanguages: ["Yoruba"] }))).toBe(
      "Promoted · Speaks Yoruba · In Lagos",
    )

    const pool = Array.from({ length: 12 }, (_, i) =>
      scoreCandidate(candidate({ talentId: `t${i}`, qualityScore: 100 - i, lifetimeImpressions: i >= 10 ? 0 : 500 }), {
        ...yorubaLead,
        role: null,
      }),
    )
    const ranked = applyFairness(pool, {
      config: { ...DEFAULT_FAIRNESS_CONFIG, explorationFraction: 0.1 },
      exposureThreshold: 1_000,
      seed: 1,
    })
    const explorer = ranked.find((c) => c.explored)
    expect(explorer).toBeDefined()
    expect(deckReasonText(explorer!.reasons, facts(), DEFAULT_RANKING_WEIGHTS)).toMatch(/^Discovery pick/)
  })
})
