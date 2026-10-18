import type { SectionMediaMeta } from "./types"
import { DEFAULT_GALLERY_TILE_ASPECT, DEFAULT_HERO_ASPECT, DEFAULT_SHOWREEL_ASPECT } from "./constants"

export function mediaHeightForWidth(
  mediaId: string | null | undefined,
  cardWidth: number,
  mediaMeta: SectionMediaMeta,
  fallbackAspect: number,
): number {
  if (!mediaId) {
    return cardWidth / fallbackAspect
  }
  const meta = mediaMeta[mediaId]
  if (meta?.width && meta?.height && meta.width > 0) {
    return (cardWidth * meta.height) / meta.width
  }
  return cardWidth / fallbackAspect
}

export function estimateTextBlockHeight(
  text: string | undefined,
  cardWidth: number,
  lineHeight: number,
  charsPerLine: number,
  maxLines: number,
): number {
  if (!text?.trim()) return 0
  const lines = Math.min(maxLines, Math.ceil(text.length / charsPerLine))
  return lines * lineHeight
}

export function heroMediaHeight(
  mediaId: string | null,
  cardWidth: number,
  mediaMeta: SectionMediaMeta,
): number {
  return mediaHeightForWidth(mediaId, cardWidth, mediaMeta, DEFAULT_HERO_ASPECT)
}

export function showreelMediaHeight(
  mediaId: string | null,
  cardWidth: number,
  mediaMeta: SectionMediaMeta,
): number {
  return mediaHeightForWidth(mediaId, cardWidth, mediaMeta, DEFAULT_SHOWREEL_ASPECT)
}

export function galleryTileHeight(cardWidth: number, mediaMeta: SectionMediaMeta, mediaId: string): number {
  return mediaHeightForWidth(mediaId, cardWidth / 2 - 4, mediaMeta, DEFAULT_GALLERY_TILE_ASPECT)
}
