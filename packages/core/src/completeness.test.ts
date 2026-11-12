import { describe, expect, it } from "vitest"

import { computeCompleteness, type CompletenessInput } from "./completeness.js"

const quickStartBase: CompletenessInput = {
  hasDisplayName: true,
  hasCity: true,
  hasBio: true,
  photoCount: 3,
  skillCount: 3,
  visibleSectionTypes: ["hero", "about", "skills"],
  hasShowreelMedia: false,
  contentCounts: { credits: 0, languages: 0, rates: 0, availabilityMonths: 0, standardAttributes: 0 },
  categoryCount: 1,
}

function withCounts(counts: Partial<CompletenessInput["contentCounts"]>, types: string[] = []) {
  return {
    ...quickStartBase,
    visibleSectionTypes: [...quickStartBase.visibleSectionTypes, ...types],
    contentCounts: { ...quickStartBase.contentCounts, ...counts },
  }
}

describe("computeCompleteness", () => {
  it("scores a showreel only when the visible section has a video", () => {
    const without = computeCompleteness(quickStartBase)
    const emptyReel = computeCompleteness({
      ...quickStartBase,
      visibleSectionTypes: [...quickStartBase.visibleSectionTypes, "showreel"],
    })
    expect(emptyReel.score).toBe(without.score)
    const withReel = computeCompleteness({
      ...quickStartBase,
      visibleSectionTypes: [...quickStartBase.visibleSectionTypes, "showreel"],
      hasShowreelMedia: true,
    })
    expect(withReel.weights.showreel).toBe(15)
    expect(withReel.score).toBeGreaterThan(without.score)
  })

  it("leaves the score alone for an empty Credits section and raises it with the first credit", () => {
    const base = computeCompleteness(quickStartBase)
    const empty = computeCompleteness(withCounts({}, ["credits"]))
    expect(empty.score).toBe(base.score)
    const one = computeCompleteness(withCounts({ credits: 1 }, ["credits"]))
    expect(one.score).toBeGreaterThan(base.score)
  })

  it("does not score content in a hidden section", () => {
    const hidden = computeCompleteness(withCounts({ languages: 2 }))
    expect(hidden.score).toBe(computeCompleteness(quickStartBase).score)
  })

  it("caps section points", () => {
    const full = computeCompleteness(
      withCounts(
        { credits: 2, languages: 1, rates: 1, availabilityMonths: 12, standardAttributes: 3 },
        ["credits", "languages", "rates", "availability", "attributes"]
      )
    )
    expect(full.weights.sections).toBe(20)
  })

  it("does not use complexion, ethnicity, gender, body measurements, or rate visibility", () => {
    const keys = [...Object.keys(quickStartBase), ...Object.keys(quickStartBase.contentCounts)]
    for (const banned of [
      "complexion",
      "ethnicity",
      "gender",
      "height",
      "weight",
      "bust",
      "waist",
      "sensitive",
      "visibility",
    ]) {
      expect(keys.some((key) => key.toLowerCase().includes(banned))).toBe(false)
    }
  })

  it("marks quick start met when minimum fields satisfied", () => {
    const result = computeCompleteness(quickStartBase)
    expect(result.quickStartMet).toBe(true)
    expect(result.canPublish).toBe(true)
    expect(result.publishBlockers).toEqual([])
  })

  it("blocks publishing without a category, and says so first", () => {
    const result = computeCompleteness({ ...quickStartBase, categoryCount: 0 })
    expect(result.quickStartMet).toBe(true)
    expect(result.canPublish).toBe(false)
    expect(result.publishBlockers).toEqual(["category"])
    expect(result.nextStep?.key).toBe("category")
  })

  it("names the most valuable next addition", () => {
    expect(computeCompleteness(quickStartBase).nextStep).toMatchObject({ key: "showreel", points: 15 })
    const withReel = computeCompleteness({
      ...quickStartBase,
      visibleSectionTypes: [...quickStartBase.visibleSectionTypes, "showreel"],
      hasShowreelMedia: true,
    })
    expect(withReel.nextStep).toMatchObject({ key: "credits", label: "Add your first credit" })
    expect(computeCompleteness({ ...quickStartBase, hasBio: false }).nextStep?.key).toBe("quick_start")
  })
})
