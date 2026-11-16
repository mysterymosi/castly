import { readStoredPortfolioSection } from "@workspace/schema"
import { describe, expect, it } from "vitest"

import { portfolioLayoutFor, portfolioLayouts, portfolioSections } from "./portfolio-layout.js"

describe("portfolio layout", () => {
  it("leads on-camera talent with who they are, everyone else with their work", () => {
    expect(portfolioLayoutFor("on_camera")[0]).toBe("about")
    expect(portfolioLayoutFor(null)).toBe(portfolioLayouts.on_camera)
    for (const kind of ["crew", "production", "events"] as const) {
      expect(portfolioLayoutFor(kind).slice(0, 2)).toEqual(["credits", "showreel"])
    }
  })

  it("lists the same sections in both layouts, just ordered differently", () => {
    expect([...portfolioLayouts.on_camera].sort()).toEqual([...portfolioLayouts.work].sort())
  })

  it("builds valid, current sections with stable ids and the showreel in place", () => {
    const sections = portfolioSections("crew", "01932f8a-7b6e-7000-8000-000000000106")
    expect(sections.map((s) => s.position)).toEqual(sections.map((_, i) => i))
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length)
    for (const section of sections) {
      // Throws if a config doesn't validate for its type and version.
      expect(() => readStoredPortfolioSection(section)).not.toThrow()
    }
    expect(sections.find((s) => s.type === "showreel")?.config).toEqual({
      mediaId: "01932f8a-7b6e-7000-8000-000000000106",
    })
    // Same id for the same section whichever layout it's in.
    const ids = (kind: "on_camera" | "crew") =>
      Object.fromEntries(portfolioSections(kind, null).map((s) => [s.type, s.id]))
    expect(ids("on_camera")).toEqual(ids("crew"))
  })
})
