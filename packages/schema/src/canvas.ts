import { z } from "zod"

/**
 * The deck's Canvas (Spotify's term): a short vertical loop, or a still, that fills the card behind
 * the talent's name. Separate from the showreel, which is the long-form video in the portfolio.
 * Spotify's limits, except height: footage straight off a phone is 1920px tall or more, so only
 * the minimum holds for video. Stills are resized to `stillHeight` before upload.
 */
export const canvasSpec = {
  minDurationMs: 3_000,
  maxDurationMs: 8_000,
  /** Width over height. */
  aspect: 9 / 16,
  aspectTolerance: 0.02,
  minHeight: 720,
  stillHeight: 1080,
  videoTypes: ["video/mp4", "video/quicktime"],
} as const

export type CanvasCandidate = {
  kind: "image" | "video" | "audio" | "document"
  width: number | null
  height: number | null
  durationMs: number | null
  /** Checked when known (the picker knows; a stored asset doesn't). */
  mimeType?: string | null
}

/**
 * Why `media` can't be a canvas, in words for the talent, or null when it can. Unknown values
 * (a video still processing) pass; the deck checks again once the provider has measured it.
 */
export function canvasProblem(media: CanvasCandidate): string | null {
  if (media.kind !== "image" && media.kind !== "video") return "A canvas is a video or a photo."
  if (
    media.kind === "video" &&
    media.mimeType &&
    !(canvasSpec.videoTypes as readonly string[]).includes(media.mimeType)
  ) {
    return "Use an MP4 or MOV video."
  }
  if (media.width !== null && media.height !== null) {
    const ratio = media.width / media.height
    if (Math.abs(ratio - canvasSpec.aspect) > canvasSpec.aspect * canvasSpec.aspectTolerance) {
      return "A canvas is vertical, 9:16."
    }
    if (media.height < canvasSpec.minHeight) {
      return `A canvas is at least ${canvasSpec.minHeight}px tall.`
    }
  }
  if (media.kind === "video" && media.durationMs !== null) {
    if (media.durationMs < canvasSpec.minDurationMs || media.durationMs > canvasSpec.maxDurationMs) {
      return `A canvas video is ${canvasSpec.minDurationMs / 1000}–${canvasSpec.maxDurationMs / 1000} seconds long.`
    }
  }
  return null
}

export const setCanvasInput = z.object({
  /** null removes the canvas; the card falls back to photos. */
  mediaId: z.uuid().nullable(),
})
