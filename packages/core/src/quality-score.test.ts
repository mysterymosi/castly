import { describe, expect, it } from "vitest"

import { computeQualityScore, type QualityScoreInput } from "./quality-score.js"

const base: QualityScoreInput = {
  completenessScore: 80,
  readyMediaCount: 3,
  meanImageShortEdge: 1080,
  hasShowreel: false,
  creditCount: 0,
  verificationTier: "none",
}

describe("computeQualityScore", () => {
  it("rises with showreel, credits, and verification, and ignores extra fields", () => {
    const plain = computeQualityScore(base)
    const withReel = computeQualityScore({ ...base, hasShowreel: true })
    const withCredits = computeQualityScore({ ...base, creditCount: 5 })
    const withId = computeQualityScore({ ...base, verificationTier: "identity" })
    expect(withReel).toBeGreaterThan(plain)
    expect(withCredits).toBeGreaterThan(plain)
    expect(withId).toBeGreaterThan(plain)
    expect(withId - plain).toBeLessThanOrEqual(5)

    const polluted = computeQualityScore({
      ...base,
      followerCount: 1_000_000,
      ethnicity: "black",
      complexion: "deep",
      gender: "woman",
    } as QualityScoreInput)
    expect(polluted).toBe(plain)
  })

  it("does not read sensitive or follower keys from the input type", () => {
    const keys = Object.keys(base)
    for (const banned of ["follower", "ethnicity", "complexion", "gender", "height", "weight"]) {
      expect(keys.some((key) => key.toLowerCase().includes(banned))).toBe(false)
    }
  })
})
