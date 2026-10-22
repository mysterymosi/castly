import { randomUUID } from "node:crypto"

import { schema, type Db } from "@workspace/db"
import type { CreateUploadUrlInput, MediaStatusOutput } from "@workspace/schema"
import { and, eq, isNull } from "drizzle-orm"

import { createCloudflareImageUpload } from "./cloudflare.js"
import { maybeSyncCloudflareAsset } from "./cloudflare-sync.js"
import { assertCloudflareDeliveryConfig, mediaBackend, mediaPublicBaseUrl } from "./config.js"
import {
  imageVariantsForRef,
  videoPlaybackUrl,
  videoPosterUrl,
} from "./delivery.js"
import { MediaError } from "./errors.js"
import { createMuxVideoUpload } from "./mux.js"
import { muxConfigured } from "./mux-client.js"
import { syncMuxVideoIfReady } from "./mux-sync.js"
import type { MediaProviderReadyEvent } from "./provider-events.js"
import { hashUploadSecret, newUploadSecret } from "./token.js"

const uploadTtlMs = 60 * 60 * 1000

export async function createUploadUrl(
  db: Db,
  userId: string,
  input: CreateUploadUrlInput
) {
  if (input.kind === "video" && !input.contentType.startsWith("video/")) {
    throw new MediaError("invalid_kind", "Video uploads require a video content type")
  }
  if (input.kind === "image" && !input.contentType.startsWith("image/")) {
    throw new MediaError("invalid_kind", "Image uploads require an image content type")
  }

  const mediaId = randomUUID()
  const backend = mediaBackend()
  const provider = input.kind === "image" ? "cf_images" : "mux"

  let uploadUrl: string
  let uploadMethod: "POST" | "PUT" = input.kind === "video" ? "PUT" : "POST"
  let uploadHeaders: Record<string, string> = {}
  let providerRef: string | null = null

  await db.insert(schema.mediaAssets).values({
    id: mediaId,
    ownerId: userId,
    kind: input.kind,
    provider: backend === "cloudflare" ? provider : "supabase",
    providerRef: backend === "local" ? `local-${mediaId}` : null,
    status: "pending",
  })

  if (backend === "cloudflare") {
    if (input.kind === "video" && !muxConfigured()) {
      throw new MediaError(
        "invalid_kind",
        "Video uploads require MUX_TOKEN_ID and MUX_TOKEN_SECRET (Mux direct upload)"
      )
    }
    const created =
      input.kind === "image"
        ? await createCloudflareImageUpload({
            mediaId,
            contentType: input.contentType,
          })
        : await createMuxVideoUpload(mediaId)
    uploadUrl = created.uploadUrl
    uploadMethod = created.uploadMethod
    uploadHeaders = created.uploadHeaders
    providerRef = created.providerRef
    await db
      .update(schema.mediaAssets)
      .set({ providerRef, updatedAt: new Date() })
      .where(eq(schema.mediaAssets.id, mediaId))
  } else {
    const tokenId = randomUUID()
    const secret = newUploadSecret()
    const expiresAt = new Date(Date.now() + uploadTtlMs)
    await db.insert(schema.mediaUploadTokens).values({
      id: tokenId,
      mediaId,
      secretHash: hashUploadSecret(secret),
      expiresAt,
    })
    uploadUrl = `${mediaPublicBaseUrl()}/hooks/media/upload/${tokenId}?secret=${encodeURIComponent(secret)}`
    uploadMethod = "POST"
    uploadHeaders = { "Content-Type": input.contentType }
  }

  const expiresAt = new Date(Date.now() + uploadTtlMs).toISOString()

  return {
    mediaId,
    uploadUrl,
    uploadMethod,
    uploadHeaders,
    expiresAt,
  }
}

async function loadOwnedMedia(db: Db, userId: string, mediaId: string) {
  const rows = await db
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.id, mediaId))
    .limit(1)
  const row = rows[0]
  if (!row) throw new MediaError("media_not_found", "Media not found")
  if (row.ownerId !== userId) throw new MediaError("media_forbidden", "Not your media")
  return row
}

export async function getMediaStatus(
  db: Db,
  userId: string,
  mediaId: string
): Promise<MediaStatusOutput> {
  let row = await loadOwnedMedia(db, userId, mediaId)
  if (mediaBackend() === "cloudflare") {
    if (row.provider === "mux") {
      await syncMuxVideoIfReady(db, row)
    } else {
      await maybeSyncCloudflareAsset(db, row)
    }
    row = await loadOwnedMedia(db, userId, mediaId)
  }
  return toMediaStatus(row)
}

export async function deleteMedia(db: Db, userId: string, mediaId: string) {
  const row = await loadOwnedMedia(db, userId, mediaId)
  if (row.status !== "pending" && row.status !== "failed") {
    throw new MediaError("delete_not_allowed", "Only pending or failed uploads can be deleted")
  }
  await db.delete(schema.mediaAssets).where(eq(schema.mediaAssets.id, mediaId))
  return { ok: true as const }
}

export async function consumeUploadToken(
  db: Db,
  tokenId: string,
  secret: string
) {
  const tokenRows = await db
    .select()
    .from(schema.mediaUploadTokens)
    .where(eq(schema.mediaUploadTokens.id, tokenId))
    .limit(1)
  const token = tokenRows[0]
  if (!token) throw new MediaError("upload_token_invalid", "Upload link is invalid")
  if (token.secretHash !== hashUploadSecret(secret)) {
    throw new MediaError("upload_token_invalid", "Upload link is invalid")
  }
  if (token.expiresAt.getTime() < Date.now()) {
    throw new MediaError("upload_token_expired", "Upload link expired")
  }
  if (token.consumedAt) {
    throw new MediaError("upload_token_consumed", "Upload link already used")
  }

  const updated = await db
    .update(schema.mediaUploadTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.mediaUploadTokens.id, tokenId),
        isNull(schema.mediaUploadTokens.consumedAt)
      )
    )
    .returning({ mediaId: schema.mediaUploadTokens.mediaId })

  if (updated.length === 0) {
    throw new MediaError("upload_token_consumed", "Upload link already used")
  }

  return updated[0]!.mediaId
}

export async function markMediaProcessing(db: Db, mediaId: string) {
  await db
    .update(schema.mediaAssets)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(schema.mediaAssets.id, mediaId))
}

export async function applyMediaReadyEvent(db: Db, event: MediaProviderReadyEvent) {
  const rows = await db
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.id, event.mediaId))
    .limit(1)
  if (!rows[0]) throw new MediaError("media_not_found", "Media not found")

  const posterUrl =
    event.posterUrl ??
    (event.kind === "video"
      ? videoPosterUrl(rows[0].provider, event.providerRef, null)
      : null)

  await db
    .update(schema.mediaAssets)
    .set({
      status: "ready",
      providerRef: event.providerRef,
      width: event.width ?? null,
      height: event.height ?? null,
      durationMs: event.durationMs ?? null,
      posterUrl,
      blurhash: event.blurhash ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.mediaAssets.id, event.mediaId))

  await db
    .insert(schema.mediaModerationJobs)
    .values({ mediaId: event.mediaId, status: "pending" })
    .onConflictDoNothing({ target: schema.mediaModerationJobs.mediaId })
}

function toMediaStatus(row: typeof schema.mediaAssets.$inferSelect): MediaStatusOutput {
  const providerRef = row.providerRef
  if (row.status === "ready" && providerRef && mediaBackend() === "cloudflare") {
    if (row.kind === "image") {
      assertCloudflareDeliveryConfig("image")
    }
  }
  const playbackUrl =
    row.kind === "video" && row.status === "ready" && providerRef
      ? videoPlaybackUrl(row.provider, providerRef)
      : null
  const variants =
    row.kind === "image" && row.status === "ready" && providerRef
      ? imageVariantsForRef(providerRef)
      : null

  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    posterUrl:
      row.kind === "video" && row.status === "ready" && providerRef
        ? videoPosterUrl(row.provider, providerRef, row.posterUrl)
        : row.posterUrl,
    playbackUrl,
    blurhash: row.blurhash,
    variants,
  }
}
