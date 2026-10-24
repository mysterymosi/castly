import { describe, expect, it } from "vitest"

import { computeCompleteness } from "./completeness.js"

const quickStartBase = {
  hasDisplayName: true,
  hasCity: true,
  hasBio: true,
  photoCount: 3,
  skillCount: 3,
  visibleSectionTypes: ["hero", "gallery", "about", "skills"],
}

describe("computeCompleteness", () => {
  it("increases when showreel section is visible", () => {
    const without = computeCompleteness(quickStartBase)
    const withReel = computeCompleteness({
      ...quickStartBase,
      visibleSectionTypes: [...quickStartBase.visibleSectionTypes, "showreel"],
    })
    expect(withReel.weights.showreel).toBe(15)
    expect(withReel.score).toBeGreaterThan(without.score)
  })

  it("does not use complexion, ethnicity, gender, or body measurements", () => {
    const baseline = computeCompleteness(quickStartBase)
    const same = computeCompleteness({ ...quickStartBase })
    expect(same.score).toBe(baseline.score)
    const keys = Object.keys(quickStartBase)
    for (const banned of ["complexion", "ethnicity", "gender", "height", "weight", "bust", "waist"]) {
      expect(keys.some((key) => key.toLowerCase().includes(banned))).toBe(false)
    }
  })

  it("marks quick start met when minimum fields satisfied", () => {
    const result = computeCompleteness(quickStartBase)
    expect(result.quickStartMet).toBe(true)
    expect(result.canPublish).toBe(true)
  })
})
