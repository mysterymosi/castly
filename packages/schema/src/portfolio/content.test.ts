import { describe, expect, it } from "vitest"

import { attributeAppliesTo, availabilityMonthKey } from "../talent/studio"
import {
  layoutPortfolio,
  readRenderableSections,
  sectionHasContent,
  selectAbout,
  selectAvailability,
} from "./content"
import { readStoredPortfolioSection } from "./registry"

const now = new Date(Date.UTC(2026, 10, 11))

function section(type: "credits" | "availability" | "languages" | "about", config: unknown) {
  return readStoredPortfolioSection({ type, schemaVersion: 1, config })
}

describe("sectionHasContent", () => {
  it("treats a list section without rows as empty, and text sections as content", () => {
    const credits = section("credits", { signatureOnly: false })
    expect(sectionHasContent(credits, {}, now)).toBe(false)
    expect(
      sectionHasContent(credits, { credits: [{ title: "Ìjọ̀ba", isSignature: false, verified: false }] }, now)
    ).toBe(true)
    expect(sectionHasContent(section("about", {}), { bio: "Hello" }, now)).toBe(true)
  })

  it("counts accents alone only when the section shows them", () => {
    const content = { accents: [{ name: "Yoruba" }] }
    expect(sectionHasContent(section("languages", { showAccents: true }), content, now)).toBe(true)
    expect(sectionHasContent(section("languages", { showAccents: false }), content, now)).toBe(false)
  })

  it("drops empty sections from the renderable list", () => {
    const rows = [
      { id: "00000000-0000-4000-8000-000000000001", type: "about" as const, schemaVersion: 1, position: 0, isVisible: true, config: { body: "Hello" } },
      {
        id: "00000000-0000-4000-8000-000000000002",
        type: "credits" as const,
        schemaVersion: 1,
        position: 1,
        isVisible: true,
        config: { signatureOnly: false },
      },
    ]
    expect(readRenderableSections(rows, {}, now).map((s) => s.type)).toEqual(["about"])
  })
})

describe("selectAvailability", () => {
  const config = { horizonMonths: 3 }

  it("shows the full horizon once anything is set, unset months as available", () => {
    const rows = selectAvailability(config, { availability: [{ month: "2026-12", status: "booked" }] }, now)
    expect(rows.map((r) => [r.month, r.status])).toEqual([
      ["2026-11", "available"],
      ["2026-12", "booked"],
      ["2027-01", "available"],
    ])
  })

  it("shows nothing when the talent never set a month", () => {
    expect(selectAvailability(config, { availability: [] }, now)).toEqual([])
  })
})

describe("availabilityMonthKey", () => {
  it("rolls over the year", () => {
    expect(availabilityMonthKey(now, 2)).toBe("2027-01")
    expect(availabilityMonthKey(now, -11)).toBe("2025-12")
  })
})

describe("attributeAppliesTo", () => {
  const models = "models"
  const makeup = "makeup"
  const runway = "runway"
  const parentOf = (id: string) => (id === runway ? models : null)

  it("applies to every category when it names none", () => {
    expect(attributeAppliesTo({ appliesToCategoryIds: [] }, [makeup])).toBe(true)
  })

  it("matches a named category or one of its ancestors, nothing else", () => {
    const height = { appliesToCategoryIds: [models] }
    expect(attributeAppliesTo(height, [models])).toBe(true)
    expect(attributeAppliesTo(height, [runway], parentOf)).toBe(true)
    expect(attributeAppliesTo(height, [makeup], parentOf)).toBe(false)
    expect(attributeAppliesTo(height, [])).toBe(false)
  })
})

describe("selectAbout", () => {
  it("uses the section's own text, else the profile bio, else nothing", () => {
    expect(selectAbout({ body: "Section text" }, { bio: "Profile bio" }).body).toBe("Section text")
    expect(selectAbout({}, { bio: "  Profile bio  " }).body).toBe("Profile bio")
    expect(selectAbout({ body: "   " }, { bio: "Profile bio" }).body).toBe("Profile bio")
    expect(selectAbout({}, { bio: "  " }).body).toBeNull()
    expect(selectAbout({}, {}).body).toBeNull()
  })

  it("counts as content with a bio, or with an image, and not otherwise", () => {
    const about = section("about", {})
    expect(sectionHasContent(about, {}, now)).toBe(false)
    expect(sectionHasContent(about, { bio: "Actor in Lagos." }, now)).toBe(true)
    expect(
      sectionHasContent(section("about", { mediaId: "00000000-0000-4000-8000-000000000009" }), {}, now)
    ).toBe(true)
  })
})

describe("layoutPortfolio", () => {
  const order = (sections: string[], photos: string[]) =>
    layoutPortfolio(sections, photos).map((item) => (item.kind === "section" ? item.section : item.mediaId))

  it("spreads a few photos apart through the sections", () => {
    expect(order(["a", "b", "c", "d"], ["p1"])).toEqual(["a", "b", "c", "p1", "d"])
    expect(order(["a", "b", "c", "d"], ["p1", "p2"])).toEqual(["a", "b", "p1", "c", "d", "p2"])
  })

  it("puts one after each section when the counts match, and doubles up evenly beyond", () => {
    expect(order(["a", "b"], ["p1", "p2"])).toEqual(["a", "p1", "b", "p2"])
    expect(order(["a", "b"], ["p1", "p2", "p3", "p4", "p5"])).toEqual([
      "a", "p1", "p2", "b", "p3", "p4", "p5",
    ])
  })

  it("keeps photo order and numbers photos after Main", () => {
    const items = layoutPortfolio(["a", "b", "c"], ["p1", "p2", "p3"])
    const photos = items.flatMap((item) => (item.kind === "photo" ? [[item.mediaId, item.index]] : []))
    expect(photos).toEqual([["p1", 1], ["p2", 2], ["p3", 3]])
  })

  it("handles no photos and no sections", () => {
    expect(order(["a", "b"], [])).toEqual(["a", "b"])
    expect(order([], ["p1", "p2"])).toEqual(["p1", "p2"])
  })
})
