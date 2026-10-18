import { corePortfolioSectionTypes } from "@workspace/schema"
import { describe, expect, it } from "vitest"

import { CARD_WIDTH } from "./constants"
import { estimateSectionHeight, studioSectionRegistry } from "./registry"

const emptyMeta = {}

describe("studioSectionRegistry", () => {
  it("registers every core section type with estimateHeight", () => {
    for (const type of corePortfolioSectionTypes) {
      const entry = studioSectionRegistry[type]
      expect(entry, `${type} missing from studio registry`).toBeDefined()
      expect(typeof entry.estimateHeight).toBe("function")
      expect(typeof entry.Section).toBe("function")
    }
    expect(Object.keys(studioSectionRegistry).length).toBe(corePortfolioSectionTypes.length)
  })

  it("returns positive height estimates for minimal configs", () => {
    const samples = [
      {
        type: "hero" as const,
        schemaVersion: 2 as const,
        config: { style: "minimal" as const, mediaId: null, showBadges: false },
      },
      { type: "about" as const, schemaVersion: 1 as const, config: {} },
      { type: "gallery" as const, schemaVersion: 1 as const, config: { mediaIds: [] } },
      {
        type: "showreel" as const,
        schemaVersion: 1 as const,
        config: { mediaId: null },
      },
      { type: "credits" as const, schemaVersion: 1 as const, config: {} },
      { type: "attributes" as const, schemaVersion: 1 as const, config: {} },
      { type: "skills" as const, schemaVersion: 1 as const, config: {} },
      { type: "languages" as const, schemaVersion: 1 as const, config: {} },
      { type: "rates" as const, schemaVersion: 1 as const, config: {} },
      { type: "availability" as const, schemaVersion: 1 as const, config: {} },
    ]

    for (const section of samples) {
      const height = estimateSectionHeight(section, emptyMeta)
      expect(height, section.type).toBeGreaterThan(0)
      expect(height, section.type).toBeLessThan(CARD_WIDTH * 20)
    }
  })
})
