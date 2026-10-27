import { imageSize } from "image-size"

import { schema, type Db } from "@workspace/db"
import { eq } from "drizzle-orm"

import {
  supabaseMediaBucket,
  supabasePublicStorageBase,
  supabaseStorageBase,
} from "./config.js"
import { MediaError } from "./errors.js"
import { applyMediaReadyEvent } from "./service.js"

/*
 * Supabase Storage stands in for Cloudflare Images until that is paid for. There is no
 * resizing on the free plan, so every variant is the original (clients upload it
 * pre-compressed) and readiness is checked by fetching the object, not by a webhook.
 */

type SupabaseUploadResult = {
  uploadUrl: string
  uploadMethod: "PUT"
  uploadHeaders: Record<string, string>
  providerRef: string
}

function serviceHeaders() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) throw new MediaError("invalid_kind", "SUPABASE_SECRET_KEY is not set")
  return { apikey: key, Authorization: `Bearer ${key}` }
}

function objectPath(providerRef: string) {
  return `${supabaseMediaBucket()}/${providerRef}`
}

export async function createSupabaseImageUpload(input: {
  mediaId: string
  ownerId: string
  contentType: string
}): Promise<SupabaseUploadResult> {
  const providerRef = `images/${input.ownerId}/${input.mediaId}`
  const response = await fetch(
    `${supabaseStorageBase()}/object/upload/sign/${objectPath(providerRef)}`,
    {
      method: "POST",
      headers: { ...serviceHeaders(), "Content-Type": "application/json" },
      body: "{}",
    }
  )
  const body = (await response.json().catch(() => ({}))) as {
    url?: string
    message?: string
  }
  if (!response.ok || !body.url) {
    throw new MediaError(
      "invalid_kind",
      body.message ?? "Supabase Storage signed upload failed"
    )
  }
  return {
    // `url` is relative to the storage API: /object/upload/sign/<bucket>/<path>?token=…
    uploadUrl: `${supabasePublicStorageBase()}${body.url}`,
    uploadMethod: "PUT",
    uploadHeaders: { "Content-Type": input.contentType },
    providerRef,
  }
}

export function supabaseImageUrl(providerRef: string) {
  return `${supabasePublicStorageBase()}/object/public/${objectPath(providerRef)}`
}

/** Marks the asset ready once its object exists, reading dimensions from the bytes. */
export async function syncSupabaseImageIfReady(db: Db, mediaId: string, providerRef: string) {
  const response = await fetch(
    `${supabaseStorageBase()}/object/authenticated/${objectPath(providerRef)}`,
    { headers: serviceHeaders() }
  )
  // Storage answers 400 (not 404) for a missing object; either way, not uploaded yet.
  if (!response.ok) return false

  let dimensions: { width: number; height: number }
  try {
    dimensions = imageSize(new Uint8Array(await response.arrayBuffer()))
  } catch {
    await db
      .update(schema.mediaAssets)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(schema.mediaAssets.id, mediaId))
    return false
  }

  await applyMediaReadyEvent(db, {
    mediaId,
    providerRef,
    kind: "image",
    width: dimensions.width,
    height: dimensions.height,
  })
  return true
}

export async function maybeSyncSupabaseImage(
  db: Db,
  row: typeof schema.mediaAssets.$inferSelect
) {
  if (row.status !== "pending" && row.status !== "processing") return
  if (!row.providerRef || row.kind !== "image") return
  await syncSupabaseImageIfReady(db, row.id, row.providerRef)
}
