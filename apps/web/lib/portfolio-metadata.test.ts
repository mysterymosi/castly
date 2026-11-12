import { serializeTalent, type TalentRecord } from "@workspace/core"
import {
  fixtureMedia,
  fixtureMediaIds,
  fixtureSections,
} from "@workspace/portfolio-web/fixtures"
import {
  publicPortfolioSchema,
  readStoredPortfolioSection,
  type PublicPortfolio,
} from "@workspace/schema"
import { describe, expect, it } from "vitest"

import {
  pickShareImage,
  portfolioDescription,
  portfolioMetadata,
} from "./portfolio-metadata"

const userId = "01932f8a-7b6e-7000-8000-000000000900"

function portfolio(
  overrides: {
    profile?: Partial<TalentRecord["profile"]>
    media?: PublicPortfolio["media"]
    photoMediaIds?: string[]
  } = {}
): PublicPortfolio {
  const record: TalentRecord = {
    profile: {
      userId,
      slug: "tunde-adeyemi",
      displayName: "Tunde Adeyemi",
      headline: "Actor",
      bio: "Stage and screen actor.",
      cityId: null,
      cityName: "Lagos",
      cardConfig: { leadMediaId: null, canvasMediaId: null, canvasEnabled: true, highlightFacts: [] },
      status: "live",
      publishedAt: new Date("2026-10-01T00:00:00Z"),
      quickStartCompletedAt: null,
      completenessScore: 80,
      qualityScore: 60,
      rateVisibility: "public",
      ...overrides.profile,
    },
    // Stored sections arrive migrated, as the API's loader produces them.
    sections: fixtureSections.map((section) => {
      const current = readStoredPortfolioSection(section)
      return { ...section, schemaVersion: current.schemaVersion, config: current.config }
    }),
    photoMediaIds: overrides.photoMediaIds ?? [...fixtureMediaIds.photos],
    skillIds: [],
    rates: [],
    content: { credits: [], attributes: [], skills: [], languages: [], accents: [], availability: [] },
  }
  // Parsed through the API's output schema, as the web app receives it.
  return publicPortfolioSchema.parse({
    talent: serializeTalent(record, { kind: "anonymous" }, {}),
    media: overrides.media ?? fixtureMedia,
  })
}

const ogUrl = (mediaId: string) => `https://imagedelivery.net/hash/${mediaId}/og`

describe("portfolioMetadata", () => {
  it("emits Open Graph and Twitter tags for the stored slug", () => {
    const metadata = portfolioMetadata(portfolio())
    expect(metadata.title).toBe("Tunde Adeyemi — Actor")
    expect(metadata.description).toBe("Actor · Lagos. Stage and screen actor.")
    expect(metadata.alternates?.canonical).toBe("/tunde-adeyemi")
    expect(metadata.openGraph).toMatchObject({
      type: "profile",
      url: "/tunde-adeyemi",
      siteName: "Castly",
      title: "Tunde Adeyemi — Actor",
      description: "Actor · Lagos. Stage and screen actor.",
      images: [{ url: ogUrl(fixtureMediaIds.photos[0]), width: 1200, height: 630 }],
    })
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Tunde Adeyemi — Actor",
      images: [{ url: ogUrl(fixtureMediaIds.photos[0]) }],
    })
  })

  it("falls back to the generated card when no photo or poster is ready", () => {
    const metadata = portfolioMetadata(portfolio({ media: {} }))
    expect(metadata.openGraph?.images).toEqual([
      { url: "/api/og/tunde-adeyemi", width: 1200, height: 630, alt: "Tunde Adeyemi" },
    ])
  })
})

describe("pickShareImage", () => {
  it("prefers Main over the hero", () => {
    const main = fixtureMediaIds.photos[1]
    const image = pickShareImage(portfolio({ photoMediaIds: [main, fixtureMediaIds.photos[0]] }))
    expect(image?.url).toBe(ogUrl(main))
  })

  it("skips a photo that is not ready and falls through to the next", () => {
    const [main, second] = fixtureMediaIds.photos
    const { [main]: mainMedia, ...rest } = fixtureMedia
    const image = pickShareImage(
      portfolio({ media: { ...rest, [main]: { ...mainMedia!, status: "processing" } } })
    )
    expect(image?.url).toBe(ogUrl(second))
  })

  it("uses the hero image when there are no photos", () => {
    expect(pickShareImage(portfolio({ photoMediaIds: [] }))?.url).toBe(ogUrl(fixtureMediaIds.hero))
  })

  it("ignores a showreel frame the talent did not choose", () => {
    const reel = fixtureMediaIds.showreel
    expect(
      pickShareImage(portfolio({ photoMediaIds: [], media: { [reel]: fixtureMedia[reel]! } }))
    ).toBeNull()
  })
})

describe("portfolioDescription", () => {
  it("caps the description at 160 characters", () => {
    const description = portfolioDescription({
      ...portfolio().talent.profile,
      bio: "x".repeat(400),
    })
    expect(description).toHaveLength(160)
    expect(description?.endsWith("…")).toBe(true)
  })
})
