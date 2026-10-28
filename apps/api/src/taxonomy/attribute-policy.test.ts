import { launchAttributeDefinitions } from "@workspace/db/seed-attributes"
import { taxonomyAttributeKeys } from "@workspace/schema"
import { describe, expect, it } from "vitest"

/**
 * PRD §7.3.1 encoded as a test: the seeded taxonomy must match the tier policy. Changing a tier
 * is a policy change and should fail here until this table is updated with it.
 */
const policy: Record<string, "standard" | "sensitive"> = {
  height_cm: "standard",
  hair: "standard",
  eye_colour: "standard",
  visible_tattoos: "standard",
  visible_piercings: "standard",
  playing_age_min: "standard",
  playing_age_max: "standard",
  dress_size: "standard",
  shoe_size_eu: "standard",
  experience_years: "standard",
  languages: "standard",
  accents: "standard",
  ethnicity: "sensitive",
  complexion: "sensitive",
  gender: "sensitive",
  bust_chest_cm: "sensitive",
  waist_cm: "sensitive",
  hips_cm: "sensitive",
}

/** PRD §7.3.1 prohibited tier: not collected at all — no field may even resemble these. */
const prohibited = [
  "religion",
  "faith",
  "health",
  "disab",
  "marital",
  "married",
  "orientation",
  "sexuality",
  "pregnan",
  "hiv",
]

const byKey = new Map(launchAttributeDefinitions.map((d) => [d.key, d]))

describe("launch attribute taxonomy (PRD §7.3.1)", () => {
  it("assigns every seeded attribute the tier the policy gives it", () => {
    const seeded = Object.fromEntries(launchAttributeDefinitions.map((d) => [d.key, d.tier]))
    expect(seeded).toEqual(policy)
  })

  it("includes the brief attributes: height, age range, languages; complexion, gender, measurements", () => {
    for (const key of ["height_cm", "playing_age_min", "playing_age_max", "languages"]) {
      expect(byKey.get(key)?.tier, key).toBe("standard")
    }
    for (const key of ["complexion", "gender", "bust_chest_cm", "waist_cm", "hips_cm"]) {
      expect(byKey.get(key)?.tier, key).toBe("sensitive")
    }
  })

  it("has no prohibited attribute by key, label, or option", () => {
    for (const definition of launchAttributeDefinitions) {
      const text = [definition.key, definition.label, ...(definition.options ?? [])]
        .join(" ")
        .toLowerCase()
      for (const banned of prohibited) {
        expect(text, `${definition.key} resembles prohibited "${banned}"`).not.toContain(banned)
      }
    }
  })

  it("uses the neutral complexion set with no ranked scale", () => {
    expect(byKey.get("complexion")?.options).toEqual(["light", "medium", "deep"])
  })

  it("gives select types options and nothing else options", () => {
    for (const d of launchAttributeDefinitions) {
      const taxonomyBacked = Object.values<string>(taxonomyAttributeKeys).includes(d.key)
      if (d.dataType === "select" || (d.dataType === "multi_select" && !taxonomyBacked)) {
        expect(d.options?.length, d.key).toBeGreaterThan(0)
      } else {
        expect(d.options ?? null, d.key).toBeNull()
      }
    }
  })

  it("defines every taxonomy-backed key as a multi_select whose options come from its table", () => {
    for (const key of Object.values(taxonomyAttributeKeys)) {
      expect(byKey.get(key), key).toMatchObject({ dataType: "multi_select" })
      expect(byKey.get(key)?.options ?? null, key).toBeNull()
    }
  })
})
