/**
 * One-shot Cloudflare Images setup for Castly media pipeline.
 * Usage (from repo root, with CF_* in `.env`):
 *   pnpm cf:media-setup
 */
import { loadEnv } from "../packages/db/src/env.js"

loadEnv()

const accountId = process.env.CF_ACCOUNT_ID
const token = process.env.CF_API_TOKEN

if (!accountId || !token) {
  console.error("Set CF_ACCOUNT_ID and CF_API_TOKEN in .env")
  process.exit(1)
}

const base = "https://api.cloudflare.com/client/v4"

async function cf<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  const body = (await response.json()) as {
    success: boolean
    result?: T
    errors?: { message: string }[]
  }
  if (!body.success) {
    throw new Error(body.errors?.[0]?.message ?? `CF API failed: ${path}`)
  }
  return body.result as T
}

const castlyVariants: Record<
  string,
  { fit: string; width: number; height: number; metadata: string }
> = {
  thumb: { fit: "cover", width: 320, height: 320, metadata: "none" },
  card: { fit: "scale-down", width: 480, height: 640, metadata: "none" },
  full: { fit: "scale-down", width: 2048, height: 2048, metadata: "none" },
  og: { fit: "cover", width: 1200, height: 630, metadata: "none" },
}

async function ensureVariants() {
  const existing = await cf<{ variants: Record<string, unknown> }>(
    `/accounts/${accountId}/images/v1/variants`
  )
  for (const [id, options] of Object.entries(castlyVariants)) {
    if (existing.variants[id]) {
      console.log(`variant ${id}: already exists`)
      continue
    }
    await cf(`/accounts/${accountId}/images/v1/variants`, {
      method: "POST",
      body: JSON.stringify({ id, options }),
    })
    console.log(`variant ${id}: created`)
  }
}

async function probeImagesHash(): Promise<string> {
  if (process.env.CF_IMAGES_ACCOUNT_HASH?.trim()) {
    return process.env.CF_IMAGES_ACCOUNT_HASH.trim()
  }

  const formCreate = new FormData()
  formCreate.append("requireSignedURLs", "false")
  formCreate.append("metadata", JSON.stringify({ castlySetup: "true" }))
  const createResponse = await fetch(`${base}/accounts/${accountId}/images/v2/direct_upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formCreate,
  })
  const createBody = (await createResponse.json()) as {
    success: boolean
    result?: { id: string; uploadURL: string }
    errors?: { message: string }[]
  }
  if (!createBody.success || !createBody.result) {
    throw new Error(createBody.errors?.[0]?.message ?? "direct_upload failed")
  }
  const hashFromUrl = createBody.result.uploadURL.match(
    /upload\.imagedelivery\.net\/([^/]+)\//
  )?.[1]
  if (hashFromUrl) {
    await cf(`/accounts/${accountId}/images/v1/${createBody.result.id}`, { method: "DELETE" }).catch(
      () => undefined
    )
    return hashFromUrl
  }
  const created = createBody.result
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  )
  const form = new FormData()
  form.append("file", new Blob([png], { type: "image/png" }), "probe.png")
  const upload = await fetch(created.uploadURL, { method: "POST", body: form })
  if (!upload.ok) {
    const text = await upload.text()
    throw new Error(
      `Direct upload failed (${upload.status}): ${text.slice(0, 200)}. ` +
        "Copy CF_IMAGES_ACCOUNT_HASH from Dashboard → Images → Developer Resources."
    )
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(
      `${base}/accounts/${accountId}/images/v1/${created.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const body = (await response.json()) as {
      success: boolean
      result?: { variants?: string[] }
    }
    const sample = body.result?.variants?.[0]
    if (sample) {
      const match = sample.match(/imagedelivery\.net\/([^/]+)\//)
      if (!match?.[1]) throw new Error(`Could not parse account hash from ${sample}`)
      await cf(`/accounts/${accountId}/images/v1/${created.id}`, { method: "DELETE" })
      return match[1]
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(
    "Timed out waiting for probe image. Set CF_IMAGES_ACCOUNT_HASH manually from the dashboard."
  )
}

async function main() {
  console.log("Cloudflare Images setup for account", accountId)
  await ensureVariants()
  const hash = await probeImagesHash()
  console.log("CF_IMAGES_ACCOUNT_HASH=", hash)

  console.log("\nAdd to .env (if not already):")
  console.log(`CF_IMAGES_ACCOUNT_HASH=${hash}`)
  console.log("CASTLY_MEDIA_BACKEND=cloudflare")
  console.log("MUX_TOKEN_ID / MUX_TOKEN_SECRET for video (docs/setup/mux-video.md)")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
