import { corePortfolioSectionTypes } from "@workspace/schema"
import { fixturePortfolios, type FixturePortfolio } from "@workspace/portfolio-web/fixtures"
import { describe, expect, it } from "vitest"

import { nativeSemantics, webSemantics } from "./render"

const complete = fixturePortfolios.find((p) => p.name === "complete")!

describe("renderer parity (native vs web semantic content)", () => {
  it.each(fixturePortfolios.map((p) => [p.name, p] as const))(
    "%s: same sections, order, text, and media",
    (_name, portfolio) => {
      expect(webSemantics(portfolio)).toEqual(nativeSemantics(portfolio))
    }
  )

  it("covers every core section type with real content", () => {
    const types = nativeSemantics(complete).map((s) => s.type)
    expect(types).toEqual([...corePortfolioSectionTypes])
    const credits = nativeSemantics(complete).find((s) => s.type === "credits")
    expect(credits?.texts).toContain("King of Boys III")
  })
})

describe("the parity check fails on content divergence", () => {
  it("catches web dropping a credit that native shows", () => {
    const [first, second, ...rest] = complete.content.credits!
    const webOnly: FixturePortfolio = {
      ...complete,
      content: { ...complete.content, credits: [first!, ...rest] },
    }
    expect(second).toBeDefined()
    expect(webSemantics(webOnly)).not.toEqual(nativeSemantics(complete))
  })

  it("catches web reordering sections", () => {
    const sections = complete.sections.map((s) => ({ ...s }))
    const credits = sections.find((s) => s.type === "credits")!
    const skills = sections.find((s) => s.type === "skills")!
    ;[credits.position, skills.position] = [skills.position, credits.position]
    const webOnly: FixturePortfolio = { ...complete, sections }
    expect(webSemantics(webOnly).map((s) => s.type)).not.toEqual(
      nativeSemantics(complete).map((s) => s.type)
    )
  })
})
