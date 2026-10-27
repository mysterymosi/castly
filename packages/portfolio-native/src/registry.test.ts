import { corePortfolioSectionTypes } from "@workspace/schema"
import { describe, expect, it } from "vitest"

import {
  CARD_WIDTH,
  LIST_ROW_HEIGHT,
  SECTION_TITLE_HEIGHT,
  TWO_LINE_ROW_HEIGHT,
} from "./constants"
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

  it("sizes list sections from content rows when content is given", () => {
    const credits = { type: "credits" as const, schemaVersion: 1 as const, config: { signatureOnly: false, limit: 2 } }
    const content = {
      credits: [1, 2, 3].map((n) => ({ title: `Film ${n}`, isSignature: false, verified: false })),
    }
    // Limit 2 of 3 credits, two-line rows.
    expect(estimateSectionHeight(credits, emptyMeta, { content })).toBe(
      SECTION_TITLE_HEIGHT + 2 * TWO_LINE_ROW_HEIGHT + 24
    )
    // Without content the studio skeleton is sized from config alone.
    expect(estimateSectionHeight(credits, emptyMeta)).toBe(SECTION_TITLE_HEIGHT + 2 * LIST_ROW_HEIGHT + 24)
  })
})
