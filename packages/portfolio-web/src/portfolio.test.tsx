import { corePortfolioSectionTypes } from "@workspace/schema"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  fixtureContent,
  fixtureMedia,
  fixtureMediaIds,
  fixtureNow,
  fixtureSections,
} from "./fixtures"
import { mediaMetaFromStatus } from "./media"
import { PortfolioSections, sectionsFromDto } from "./portfolio"
import { webSectionRegistry } from "./registry"
import type { PortfolioContent } from "./types"

function renderFixture(content: PortfolioContent = fixtureContent) {
  return renderToStaticMarkup(
    <PortfolioSections
      sections={sectionsFromDto(fixtureSections)}
      mediaMeta={mediaMetaFromStatus(fixtureMedia)}
      content={content}
      now={fixtureNow}
    />
  )
}

function renderedSectionTypes(html: string): string[] {
  return [...html.matchAll(/data-section-type="([a-z_]+)"/g)].map((m) => m[1]!)
}

describe("webSectionRegistry", () => {
  it("registers every core section type", () => {
    for (const type of corePortfolioSectionTypes) {
      expect(typeof webSectionRegistry[type], type).toBe("function")
    }
    expect(Object.keys(webSectionRegistry)).toHaveLength(corePortfolioSectionTypes.length)
  })
})

describe("PortfolioSections", () => {
  it("server-renders every core type in position order with no client script", () => {
    const html = renderFixture()
    expect(renderedSectionTypes(html)).toEqual([...corePortfolioSectionTypes])
    expect(html).not.toContain("<script")
  })

  it("renders the forward-migrated hero and section text", () => {
    const html = renderFixture()
    expect(html).toContain("Actor · Lagos")
    expect(html).toContain("Stage and screen actor trained")
    expect(html).toContain("2026 reel")
    expect(html).toContain("Yoruba dialogue")
    expect(html).toContain("British RP")
    expect(html).toContain("172 cm")
  })

  it("omits hidden sections", () => {
    expect(renderFixture()).not.toContain("Hidden draft bio")
  })

  it("renders only ready media", () => {
    const html = renderFixture()
    for (const mediaId of fixtureMediaIds.gallery) {
      expect(html).toContain(`data-media-id="${mediaId}"`)
    }
    expect(html).not.toContain(fixtureMediaIds.processing)
    expect(html).toContain(`stream.mux.com/${fixtureMediaIds.showreel}.m3u8`)
  })

  it("applies the credits limit", () => {
    const html = renderFixture()
    expect(html).toContain("King of Boys III")
    expect(html).toContain("The Lagos Run")
    expect(html).not.toContain("Beyond the Limit")
  })

  it("limits availability to the configured horizon", () => {
    const html = renderFixture()
    expect(html).not.toContain("September 2026")
    expect(html).toContain("October 2026")
    expect(html).toContain("November 2026")
    expect(html).not.toContain("February 2027")
  })

  it("omits the rates block when the viewer may not see rates", () => {
    const withRates = renderFixture()
    expect(renderedSectionTypes(withRates)).toContain("rates")
    expect(withRates).toMatch(/150,000/)

    const { rates: _rates, ...withoutRates } = fixtureContent
    const html = renderFixture(withoutRates)
    expect(renderedSectionTypes(html)).not.toContain("rates")
    expect(html).not.toMatch(/150,000/)
  })

  it("renders nothing for sections without content", () => {
    const html = renderToStaticMarkup(
      <PortfolioSections sections={sectionsFromDto(fixtureSections)} now={fixtureNow} />
    )
    // Text-only hero and about survive; media and list sections have nothing to show.
    expect(renderedSectionTypes(html)).toEqual(["hero", "about"])
  })
})
