export type MediaBackend = "cloudflare" | "local"

export function mediaBackend(): MediaBackend {
  if (process.env.CASTLY_MEDIA_BACKEND === "local") return "local"
  if (
    process.env.CF_API_TOKEN &&
    process.env.CF_ACCOUNT_ID &&
    process.env.CF_ACCOUNT_ID.length > 0
  ) {
    return "cloudflare"
  }
  return "local"
}

/** Ensures delivery env is present when serving cloudflare-backed media. */
export function assertCloudflareDeliveryConfig(kind: "image" | "video") {
  if (mediaBackend() !== "cloudflare") return
  if (kind === "image" && !process.env.CF_IMAGES_ACCOUNT_HASH) {
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

export function mediaWebhookSecret() {
  const raw = process.env.MEDIA_WEBHOOK_SECRETS
  if (!raw) throw new Error("MEDIA_WEBHOOK_SECRETS is not set")
  const first = raw.split("|")[0] ?? raw
  return first.replace(/^v1,whsec_/, "")
}
