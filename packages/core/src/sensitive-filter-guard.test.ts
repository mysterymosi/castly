import { describe, expect, it } from "vitest"

import { checkAttributeFilters, type FilterAttributeTier } from "./sensitive-filter-guard.js"

const tiers: Record<string, FilterAttributeTier> = {
  height_cm: "standard",
  complexion: "sensitive",
  gender: "sensitive",
}

describe("checkAttributeFilters", () => {
  it("passes standard keys with no role", () => {
    expect(checkAttributeFilters(["height_cm"], tiers, null)).toEqual({
      ok: true,
      standard: ["height_cm"],
      sensitive: [],
    })
  })

  it("rejects sensitive keys without an active role", () => {
    expect(checkAttributeFilters(["height_cm", "complexion"], tiers, null)).toEqual({
      ok: false,
      reason: "sensitive_requires_brief",
      keys: ["complexion"],
    })
  })

  it("rejects sensitive keys on a role without a brief, including a blank one", () => {
    for (const brief of [null, "   "]) {
      expect(checkAttributeFilters(["gender"], tiers, { brief })).toMatchObject({
        ok: false,
        reason: "sensitive_requires_brief",
      })
    }
  })

  it("allows sensitive keys on a briefed role, reporting them apart from standard ones", () => {
    expect(
      checkAttributeFilters(["complexion", "height_cm"], tiers, { brief: "Lead, Lagos drama" }),
    ).toEqual({ ok: true, standard: ["height_cm"], sensitive: ["complexion"] })
  })

  it("rejects keys with no active definition before anything else", () => {
    expect(checkAttributeFilters(["shoe_colour", "complexion"], tiers, null)).toEqual({
      ok: false,
      reason: "unknown_attribute",
      keys: ["shoe_colour"],
    })
  })
})
