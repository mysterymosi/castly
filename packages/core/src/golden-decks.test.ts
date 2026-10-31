import { describe, expect, it } from "vitest"

import { DEFAULT_RANKING_WEIGHTS, scoreCandidates, type DeckCandidate, type ScoringContext } from "./deck.js"
import { applyFairness, DEFAULT_FAIRNESS_CONFIG, type FairnessContext } from "./fairness.js"

/**
 * Golden decks (TECH_SPEC §22.2): a fixed population run through stages 2 and 3 under fixed
 * contexts, with the expected order committed in `__golden__/`. A change to weights or scoring shows up as a diff
 * in review. To accept an intended change: `pnpm --filter @workspace/core test -- -u`.
 */

const ACTORS = "cat-actors"
const MODELS = "cat-models"
const CINEMATOGRAPHERS = "cat-cinematographers"

const lagos = { cityId: "lagos", region: "south-west", country: "NG" }
const ibadan = { cityId: "ibadan", region: "south-west", country: "NG" }
const abuja = { cityId: "abuja", region: "north-central", country: "NG" }
const enugu = { cityId: "enugu", region: "south-east", country: "NG" }

const talent = (
  talentId: string,
  fields: Partial<DeckCandidate> & Pick<DeckCandidate, "cityId" | "region" | "country">,
): DeckCandidate => ({
  talentId,
  categoryIds: [ACTORS],
  qualityScore: 60,
  freshnessScore: 50,
  responsivenessScore: 50,
  attributes: {},
  agencyId: null,
  impressions7d: 30,
  lifetimeImpressions: 2000,
  raisedHand: false,
  boost: 0,
  ...fields,
})

/** In stage 1's order: quality descending, as the query would return them. */
const population: DeckCandidate[] = [
  talent("tunde-cinematographer-lagos", { ...lagos, categoryIds: [CINEMATOGRAPHERS], qualityScore: 95 }),
  talent("ngozi-actress-enugu", {
    ...enugu,
    qualityScore: 90,
    attributes: { languages: ["igbo", "english"], playing_age_min: 30, playing_age_max: 38 },
  }),
  talent("amaka-model-lagos", { ...lagos, categoryIds: [MODELS], qualityScore: 85, freshnessScore: 90 }),
  // Seen four times the threshold this week: the exposure penalty takes its maximum.
  talent("bisi-actress-lagos", {
    ...lagos,
    qualityScore: 80,
    impressions7d: 400,
    attributes: { languages: ["yoruba", "english"], playing_age_min: 24, playing_age_max: 30 },
  }),
  talent("halima-actress-abuja", {
    ...abuja,
    qualityScore: 80,
    responsivenessScore: 90,
    attributes: { languages: ["hausa", "english"], playing_age_min: 25, playing_age_max: 32 },
  }),
  talent("kemi-actress-ibadan", {
    ...ibadan,
    qualityScore: 70,
    attributes: { languages: ["yoruba"], playing_age_min: 33, playing_age_max: 40, complexion: "deep" },
  }),
  talent("femi-actor-lagos", {
    ...lagos,
    qualityScore: 55,
    freshnessScore: 20,
    attributes: { languages: ["yoruba", "english"], playing_age_min: 26, playing_age_max: 34 },
  }),
  // New: never shown, so she is the one under-seen talent and takes the exploration slot.
  talent("zainab-actress-lagos-new", {
    ...lagos,
    qualityScore: 30,
    freshnessScore: 100,
    impressions7d: 0,
    lifetimeImpressions: 0,
  }),
]

const castingDirectorInLagos: ScoringContext = {
  weights: DEFAULT_RANKING_WEIGHTS,
  verticalWeights: { [ACTORS]: 1, [MODELS]: 0.7 },
  booker: lagos,
  role: null,
}

/** "Lead, Yoruba-speaking, plays 25–32", no brief. */
const yorubaLead: ScoringContext = {
  ...castingDirectorInLagos,
  role: {
    briefed: false,
    requirements: [
      { key: "languages", tier: "standard", requirement: { anyOf: ["yoruba"] } },
      { key: "playing_age_min", tier: "standard", requirement: { min: 25, max: 32 } },
      // Unbriefed: this sensitive requirement must not move anyone.
      { key: "complexion", tier: "sensitive", requirement: { anyOf: ["deep"] } },
    ],
  },
}

const briefedYorubaLead: ScoringContext = {
  ...yorubaLead,
  role: { ...yorubaLead.role!, briefed: true },
}

const fairness: FairnessContext = { config: DEFAULT_FAIRNESS_CONFIG, seed: 42, exposureThreshold: 100 }

function deck(context: ScoringContext) {
  const ranked = applyFairness(scoreCandidates(population, context), fairness)
  return `${JSON.stringify(
    ranked.map((c) => ({
      talent: c.talentId,
      score: Number(c.score.toFixed(4)),
      reasons: c.reasons.map((r) =>
        r.detail ? `${r.code}(${Object.values(r.detail).flat().join(",")})` : r.code,
      ),
    })),
    null,
    2,
  )}\n`
}

describe("golden decks", () => {
  it("cold start: a casting director in Lagos, no role", async () => {
    await expect(deck(castingDirectorInLagos)).toMatchFileSnapshot("./__golden__/cold-start-lagos.json")
  })

  it("a Yoruba-speaking lead, unbriefed", async () => {
    await expect(deck(yorubaLead)).toMatchFileSnapshot("./__golden__/yoruba-lead.json")
  })

  it("the same lead with a brief, so the complexion requirement counts", async () => {
    await expect(deck(briefedYorubaLead)).toMatchFileSnapshot("./__golden__/yoruba-lead-briefed.json")
  })
})
