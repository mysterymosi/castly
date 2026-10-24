import type { MediaStatusOutput, TalentSectionDto } from "@workspace/schema"

import type { PortfolioContent } from "./types"

/** Fixture portfolio covering every core section type. Shared with the parity suite (3.4). */

const id = (n: number) => `01932f8a-7b6e-7000-8000-${String(n).padStart(12, "0")}`

export const fixtureMediaIds = {
  hero: id(101),
  about: id(102),
  gallery: [id(103), id(104), id(105)],
  showreel: id(106),
  processing: id(107),
} as const

const image = (mediaId: string): MediaStatusOutput => ({
  id: mediaId,
  kind: "image",
  status: "ready",
  width: 1200,
  height: 1600,
  durationMs: null,
  posterUrl: null,
  playbackUrl: null,
  blurhash: null,
  variants: {
    card: `https://imagedelivery.net/hash/${mediaId}/card`,
    thumb: `https://imagedelivery.net/hash/${mediaId}/thumb`,
    full: `https://imagedelivery.net/hash/${mediaId}/full`,
    og: `https://imagedelivery.net/hash/${mediaId}/og`,
  },
})

export const fixtureMedia: Record<string, MediaStatusOutput> = {
  [fixtureMediaIds.hero]: image(fixtureMediaIds.hero),
  [fixtureMediaIds.about]: image(fixtureMediaIds.about),
  ...Object.fromEntries(fixtureMediaIds.gallery.map((m) => [m, image(m)])),
  [fixtureMediaIds.showreel]: {
    id: fixtureMediaIds.showreel,
    kind: "video",
    status: "ready",
    width: 1920,
    height: 1080,
    durationMs: 92_000,
    posterUrl: `https://image.mux.com/${fixtureMediaIds.showreel}/thumbnail.jpg`,
    playbackUrl: `https://stream.mux.com/${fixtureMediaIds.showreel}.m3u8`,
    blurhash: null,
    variants: null,
  },
  [fixtureMediaIds.processing]: {
    ...image(fixtureMediaIds.processing),
    status: "processing",
  },
}

let position = 0
const section = (
  type: TalentSectionDto["type"],
  config: unknown,
  { schemaVersion = 1, isVisible = true } = {}
): TalentSectionDto => ({
  id: id(++position),
  type,
  schemaVersion,
  position,
  isVisible,
  config,
})

export const fixtureSections: TalentSectionDto[] = [
  // Stored at v1: the renderer must receive it forward-migrated to v2.
  section("hero", {
    style: "full_bleed",
    mediaId: fixtureMediaIds.hero,
    headline: "Actor · Lagos",
    showBadges: true,
  }),
  section("about", {
    body: "Stage and screen actor trained at the Nigerian Film Institute.",
    mediaId: fixtureMediaIds.about,
  }),
  section("gallery", {
    mediaIds: [...fixtureMediaIds.gallery, fixtureMediaIds.processing],
    layout: "grid",
  }),
  section("showreel", { mediaId: fixtureMediaIds.showreel, headline: "2026 reel" }),
  section("credits", { signatureOnly: false, limit: 2 }),
  section("attributes", { showHidden: false }),
  section("skills", { highlightTop: 1 }),
  section("languages", { showAccents: true }),
  section("rates", { showCurrency: true }),
  section("availability", { horizonMonths: 3 }),
  section("about", { body: "Hidden draft bio" }, { isVisible: false }),
]

export const fixtureNow = new Date(Date.UTC(2026, 9, 24))

export const fixtureContent: PortfolioContent = {
  credits: [
    {
      title: "King of Boys III",
      roleName: "Detective Ada",
      productionCompany: "Kemi Adetiba Visuals",
      year: 2025,
      type: "Film",
      link: "https://example.com/kob3",
      isSignature: true,
      verified: true,
    },
    {
      title: "The Lagos Run",
      roleName: "Lead",
      productionCompany: null,
      year: 2024,
      type: "Series",
      link: null,
      isSignature: false,
      verified: false,
    },
    {
      title: "Beyond the Limit",
      year: 2023,
      isSignature: false,
      verified: false,
    },
  ],
  attributes: [
    { label: "Height", value: "172 cm" },
    { label: "Playing age", value: "25–32" },
  ],
  skills: [{ name: "Stage combat" }, { name: "Improvisation" }, { name: "Yoruba dialogue" }],
  languages: [
    { name: "English", fluency: "native" },
    { name: "Yoruba", fluency: "fluent" },
  ],
  accents: [{ name: "Lagos" }, { name: "British RP" }],
  rates: [
    {
      kind: "day",
      amountMin: 150_000,
      amountMax: 250_000,
      currency: "NGN",
      negotiable: true,
    },
  ],
  availability: [
    { month: "2026-09", status: "booked" },
    { month: "2026-10", status: "partial" },
    { month: "2026-11", status: "available" },
    { month: "2027-02", status: "available" },
  ],
}
