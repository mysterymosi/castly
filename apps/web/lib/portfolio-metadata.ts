import { sectionsFromDto } from "@workspace/portfolio-web"
import type { CoreSectionConfigMap } from "@workspace/schema"
import type { Metadata } from "next"

import type { PublicPortfolioResult as PublicPortfolio } from "@/lib/api"

const DESCRIPTION_MAX = 160

export type ShareImage = {
  url: string
  width?: number
  height?: number
  alt: string
}

export function portfolioTitle(profile: PublicPortfolio["talent"]["profile"]): string {
  return profile.headline ? `${profile.displayName} — ${profile.headline}` : profile.displayName
}

export function portfolioDescription(
  profile: PublicPortfolio["talent"]["profile"]
): string | undefined {
  const lead = [profile.headline, profile.cityName].filter(Boolean).join(" · ")
  const text = [lead, profile.bio?.trim()].filter(Boolean).join(". ")
  if (!text) return undefined
  return text.length > DESCRIPTION_MAX
    ? `${text.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
    : text
}

/** Media ids a link preview could use, most representative first. */
function candidateMediaIds(portfolio: PublicPortfolio): string[] {
  const sections = sectionsFromDto(portfolio.talent.sections)
  // Configs are validated by `sectionsFromDto`; the union type just does not carry them.
  const configs = <T extends keyof CoreSectionConfigMap>(type: T) =>
    sections
      .filter((section) => section.type === type)
      .map((section) => section.config as CoreSectionConfigMap[T])

  const ids: (string | null | undefined)[] = [
    portfolio.talent.profile.cardConfig.leadMediaId,
    ...configs("hero").map((c) => c.mediaId),
    ...configs("gallery").flatMap((c) => c.mediaIds),
    ...configs("about").map((c) => c.mediaId),
  ]
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

const OG_WIDTH = 1200
const OG_HEIGHT = 630

/** Mux thumbnails crop server-side; other posters are used as stored. */
function sharePoster(posterUrl: string, width: number | null, height: number | null) {
  const url = new URL(posterUrl)
  if (url.hostname === "image.mux.com") {
    url.searchParams.set("width", String(OG_WIDTH))
    url.searchParams.set("height", String(OG_HEIGHT))
    url.searchParams.set("fit_mode", "smartcrop")
    return { url: url.toString(), width: OG_WIDTH, height: OG_HEIGHT }
  }
  return { url: posterUrl, width: width ?? undefined, height: height ?? undefined }
}

/**
 * The link-preview image: the first ready photo's `og` variant (1200×630 cover crop), else the
 * card lead's poster when the talent chose a video as their lead, else null so the caller uses
 * the generated name card. Other video frames are skipped — an arbitrary frame of a phone video
 * makes a worse preview than the name card.
 */
export function pickShareImage(portfolio: PublicPortfolio): ShareImage | null {
  const alt = portfolio.talent.profile.displayName
  for (const id of candidateMediaIds(portfolio)) {
    const media = portfolio.media[id]
    if (media?.status === "ready" && media.kind === "image" && media.variants?.og) {
      return { url: media.variants.og, width: OG_WIDTH, height: OG_HEIGHT, alt }
    }
  }
  const leadId = portfolio.talent.profile.cardConfig.leadMediaId
  const lead = leadId ? portfolio.media[leadId] : undefined
  if (lead?.status === "ready" && lead.kind === "video" && lead.posterUrl) {
    return { ...sharePoster(lead.posterUrl, lead.width, lead.height), alt }
  }
  return null
}

/** Path of the generated name card used when a talent has no ready photo or poster. */
export function fallbackShareImagePath(slug: string): string {
  return `/api/og/${slug}`
}

/**
 * Page metadata for a live portfolio. URLs are relative and resolve against the root layout's
 * `metadataBase`, so `og:url` and the canonical link are always the stored slug.
 */
export function portfolioMetadata(portfolio: PublicPortfolio): Metadata {
  const { profile } = portfolio.talent
  const title = portfolioTitle(profile)
  const description = portfolioDescription(profile)
  const path = `/${profile.slug}`
  const image = pickShareImage(portfolio) ?? {
    url: fallbackShareImagePath(profile.slug),
    width: OG_WIDTH,
    height: OG_HEIGHT,
    alt: profile.displayName,
  }

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "profile",
      url: path,
      siteName: "Castly",
      locale: "en_NG",
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  }
}
