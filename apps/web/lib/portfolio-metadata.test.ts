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
      cardConfig: { leadMediaId: null, highlightFacts: [] },
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
    skillIds: [],
    rates: [],
  }
  // Parsed through the API's output schema, as the web app receives it.
  return publicPortfolioSchema.parse({
    talent: serializeTalent(record, { kind: "anonymous" }, {}),
    skills: [],
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
      images: [{ url: ogUrl(fixtureMediaIds.hero), width: 1200, height: 630 }],
    })
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Tunde Adeyemi — Actor",
      images: [{ url: ogUrl(fixtureMediaIds.hero) }],
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
  it("prefers the card lead over the hero", () => {
    const lead = fixtureMediaIds.gallery[1]
    const image = pickShareImage(
      portfolio({ profile: { cardConfig: { leadMediaId: lead, highlightFacts: [] } } })
    )
    expect(image?.url).toBe(ogUrl(lead))
  })

  it("skips media that is not ready and falls through to the gallery", () => {
    const { [fixtureMediaIds.hero]: hero, ...rest } = fixtureMedia
    const image = pickShareImage(
      portfolio({ media: { ...rest, [fixtureMediaIds.hero]: { ...hero!, status: "processing" } } })
    )
    expect(image?.url).toBe(ogUrl(fixtureMediaIds.gallery[0]))
  })

  it("uses a cropped poster when the talent chose a video as their card lead", () => {
    const reel = fixtureMediaIds.showreel
    const image = pickShareImage(
      portfolio({
        profile: { cardConfig: { leadMediaId: reel, highlightFacts: [] } },
        media: { [reel]: fixtureMedia[reel]! },
      })
    )
    expect(image).toMatchObject({
      url: `https://image.mux.com/${reel}/thumbnail.jpg?width=1200&height=630&fit_mode=smartcrop`,
      width: 1200,
      height: 630,
    })
  })

  it("ignores a showreel frame the talent did not choose", () => {
    const reel = fixtureMediaIds.showreel
    expect(pickShareImage(portfolio({ media: { [reel]: fixtureMedia[reel]! } }))).toBeNull()
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
