import { muxConfigured } from "./mux-client.js"

/** `remote` talks to real providers (images per `imageProvider()`, video on Mux). */
export type MediaBackend = "remote" | "local"

export function mediaBackend(): MediaBackend {
  const configured = process.env.CASTLY_MEDIA_BACKEND
  if (configured === "local") return "local"
  // `cloudflare` is the pre-Supabase-Storage name for the remote backend.
  if (configured === "remote" || configured === "cloudflare") return "remote"
  if (
    (process.env.CF_API_TOKEN && process.env.CF_ACCOUNT_ID) ||
    muxConfigured()
  ) {
    return "remote"
  }
  return "local"
}

export type ImageProvider = "cf_images" | "supabase"

/**
 * Where new image uploads go on the remote backend. Supabase Storage is a stopgap until
 * Cloudflare Images is switched back on; existing rows keep their own `provider`.
 */
export function imageProvider(): ImageProvider {
  return process.env.CASTLY_IMAGE_PROVIDER === "cf_images" ? "cf_images" : "supabase"
}

/** Ensures delivery env is present when serving Cloudflare-backed images. */
export function assertCloudflareDeliveryConfig() {
  if (mediaBackend() !== "remote") return
  if (!process.env.CF_IMAGES_ACCOUNT_HASH) {
    throw new Error("CF_IMAGES_ACCOUNT_HASH is not set")
  }
}

export function mediaPublicBaseUrl() {
  const fromEnv = process.env.CASTLY_PUBLIC_API_URL ?? process.env.PUBLIC_API_URL
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  const port = process.env.PORT ?? "3001"
  return `http://127.0.0.1:${port}`
}

export function cfImagesDeliveryBase() {
  const hash = process.env.CF_IMAGES_ACCOUNT_HASH
  if (!hash) throw new Error("CF_IMAGES_ACCOUNT_HASH is not set")
  return `https://imagedelivery.net/${hash}`
}

export function supabaseMediaBucket() {
  return process.env.SUPABASE_MEDIA_BUCKET?.trim() || "media"
}

/** Storage API the server calls (service key). */
export function supabaseStorageBase() {
  const base = process.env.SUPABASE_URL || "http://127.0.0.1:54321"
  return `${base.replace(/\/$/, "")}/storage/v1`
}

/**
 * Storage origin devices and browsers reach for uploads and delivery. Override when
 * SUPABASE_URL is a loopback address a phone can't reach (e.g. your LAN IP in dev).
 */
export function supabasePublicStorageBase() {
  const base =
    process.env.SUPABASE_PUBLIC_URL || process.env.SUPABASE_URL || "http://127.0.0.1:54321"
  return `${base.replace(/\/$/, "")}/storage/v1`
}

export function mediaWebhookSecret() {
  const raw = process.env.MEDIA_WEBHOOK_SECRETS
  if (!raw) throw new Error("MEDIA_WEBHOOK_SECRETS is not set")
  const first = raw.split("|")[0] ?? raw
  return first.replace(/^v1,whsec_/, "")
}
