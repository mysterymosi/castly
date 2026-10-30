import { describe, expect, it } from "vitest"

import { applyFairness, scoreCandidates, type DeckCandidate } from "./deck.js"

const candidate = (talentId: string, qualityScore: number): DeckCandidate => ({
  talentId,
  qualityScore,
  categoryIds: [],
  cityId: null,
})

describe("deck stages (interim)", () => {
  it("orders by quality and records it as a reason", () => {
    const scored = scoreCandidates([candidate("a", 40), candidate("b", 90)])
    expect(scored.map((c) => c.talentId)).toEqual(["b", "a"])
    expect(scored[0]).toMatchObject({ score: 0.9, reasons: [{ code: "quality", contribution: 0.9 }] })
  })

  it("keeps stage 1's order between tied candidates", () => {
    const seeded = ["d", "a", "c", "b"].map((id) => candidate(id, 50))
    expect(scoreCandidates(seeded).map((c) => c.talentId)).toEqual(["d", "a", "c", "b"])
  })

  it("gives a zero-quality candidate a zero score and no reason", () => {
    expect(scoreCandidates([candidate("a", 0)])[0]).toMatchObject({ score: 0, reasons: [] })
  })

  it("passes the scored order through fairness unchanged for now", () => {
    const scored = scoreCandidates([candidate("a", 10), candidate("b", 20)])
    expect(applyFairness(scored)).toEqual(scored)
  })
})
