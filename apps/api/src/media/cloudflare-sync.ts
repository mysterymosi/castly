import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { eq } from "drizzle-orm"

import { applyMediaReadyEvent } from "./service.js"

function cfHeaders() {
  const token = process.env.CF_API_TOKEN
  if (!token) return null
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

/** Poll Cloudflare Images for a direct-upload id and mark the asset ready when variants exist. */
export async function syncCloudflareImageIfReady(db: Db, mediaId: string, providerRef: string) {
  const accountId = process.env.CF_ACCOUNT_ID
  const headers = cfHeaders()
  if (!accountId || !headers) return false

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${providerRef}`,
    { headers }
  )
  const body = (await response.json()) as {
    success?: boolean
    result?: { variants?: string[]; uploaded?: string }
  }
  if (!response.ok || !body.success || !body.result?.variants?.length) return false

  const sample = body.result.variants[0]
  const blurhash = undefined
  await applyMediaReadyEvent(db, {
    mediaId,
    providerRef,
    kind: "image",
    blurhash,
  })
  return true
}

export async function maybeSyncCloudflareAsset(
  db: Db,
  row: typeof schema.mediaAssets.$inferSelect
) {
  if (row.status !== "pending" && row.status !== "processing") return
  if (!row.providerRef) return
  if (row.kind === "image" && row.provider === "cf_images") {
    await syncCloudflareImageIfReady(db, row.id, row.providerRef)
  }
}
