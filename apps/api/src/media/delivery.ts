import { schema } from "@workspace/db"

import { cfImagesDeliveryBase, mediaBackend } from "./config.js"
import { supabaseImageUrl } from "./supabase-storage.js"

type MediaProvider = typeof schema.mediaAssets.$inferSelect.provider

const imageVariants = ["card", "thumb", "full", "og"] as const

export type ImageVariants = Record<(typeof imageVariants)[number], string>

export function imageVariantsForRef(provider: MediaProvider, providerRef: string): ImageVariants {
  if (mediaBackend() === "local") {
    const base = `https://media.local.castly/${providerRef}`
    return {
      card: `${base}/card`,
      thumb: `${base}/thumb`,
      full: `${base}/full`,
      og: `${base}/og`,
    }
  }
  if (provider === "supabase") {
    // No transforms on the free plan: every variant is the uploaded original.
    const url = supabaseImageUrl(providerRef)
    return { card: url, thumb: url, full: url, og: url }
  }
  const base = cfImagesDeliveryBase()
  return {
    card: `${base}/${providerRef}/card`,
    thumb: `${base}/${providerRef}/thumb`,
    full: `${base}/${providerRef}/full`,
    og: `${base}/${providerRef}/og`,
  }
}

export function muxPlaybackUrl(playbackId: string) {
  return `https://stream.mux.com/${playbackId}.m3u8`
}

export function muxPosterUrl(playbackId: string) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg`
}

function localVideoPlaybackUrl(providerRef: string) {
  return `https://media.local.castly/stream/${providerRef}/manifest/video.m3u8`
}

function localVideoPosterUrl(providerRef: string) {
  return `https://media.local.castly/stream/${providerRef}/poster.jpg`
}

export function videoPlaybackUrl(provider: MediaProvider, providerRef: string) {
  if (provider === "mux") return muxPlaybackUrl(providerRef)
  if (mediaBackend() === "local") return localVideoPlaybackUrl(providerRef)
  return null
}

export function videoPosterUrl(
  provider: MediaProvider,
  providerRef: string,
  storedPoster: string | null
) {
  if (storedPoster) return storedPoster
  if (provider === "mux") return muxPosterUrl(providerRef)
  if (mediaBackend() === "local") return localVideoPosterUrl(providerRef)
  return null
}
