import { createHmac, timingSafeEqual } from "node:crypto"

import { schema, type Db } from "@workspace/db"
import { eq } from "drizzle-orm"

import { muxPosterUrl } from "./delivery.js"
import { MediaError } from "./errors.js"
import { muxClient } from "./mux-client.js"
import { applyMp4Rendition, chatMp4File } from "./mux-mp4.js"
import { applyMediaReadyEvent } from "./service.js"

/** Mux webhook signature (`Mux-Signature`: `t=…,v1=…`). */
export function verifyMuxWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
) {
  if (!signatureHeader) throw new MediaError("upload_token_invalid", "Missing webhook signature")
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const sep = part.indexOf("=")
      if (sep === -1) return [part.trim(), ""]
      return [part.slice(0, sep).trim(), part.slice(sep + 1).trim()]
    })
  ) as { t?: string; v1?: string }
  if (!parts.t || !parts.v1) {
    throw new MediaError("upload_token_invalid", "Malformed webhook signature")
  }
  const payload = `${parts.t}.${rawBody}`
  const expected = createHmac("sha256", secret).update(payload).digest("hex")
  const actual = Buffer.from(parts.v1, "hex")
  const expectedBuf = Buffer.from(expected, "hex")
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    throw new MediaError("upload_token_invalid", "Webhook signature mismatch")
  }
}

type MuxRenditionPayload = {
  /** Set on a static rendition's own events. */
  asset_id?: string
  name?: string
  resolution?: string
  status?: string
}

type MuxAssetPayload = MuxRenditionPayload & {
  passthrough?: string
  playback_ids?: Array<{ id?: string }>
  static_renditions?: { files?: MuxRenditionPayload[] }
  tracks?: Array<{
    type?: string
    max_width?: number
    max_height?: number
    duration?: number
  }>
}

type MuxWebhookBody = {
  type?: string
  data?: MuxAssetPayload
}

function videoTrack(asset: MuxAssetPayload) {
  return asset.tracks?.find((track) => track.type === "video")
}

const renditionEvents = new Set([
  "video.asset.static_rendition.ready",
  "video.asset.static_rendition.skipped",
  "video.asset.static_rendition.errored",
])

export async function handleMuxVideoWebhook(
  db: Db,
  rawBody: string,
  options: { assetPassthrough?: (assetId: string) => Promise<string | undefined> } = {}
) {
  const payload = JSON.parse(rawBody) as MuxWebhookBody
  const type = payload.type
  const asset = payload.data
  if (!asset || !type) return

  // A static rendition's own events carry the rendition, not the asset. Its passthrough is the
  // media id when Mux kept it; otherwise the asset's passthrough is.
  if (renditionEvents.has(type)) {
    const lookup =
      options.assetPassthrough ??
      (async (assetId: string) => (await muxClient().video.assets.retrieve(assetId)).passthrough)
    const mediaId =
      asset.passthrough ?? (asset.asset_id ? await lookup(asset.asset_id) : undefined)
    if (mediaId) await applyMp4Rendition(db, mediaId, asset)
    return
  }

  if (!asset.passthrough) return
  const mediaId = asset.passthrough

  if (type === "video.asset.errored") {
    await db
      .update(schema.mediaAssets)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(schema.mediaAssets.id, mediaId))
    return
  }

  if (type !== "video.asset.ready" || asset.status !== "ready") return

  const playbackId = asset.playback_ids?.[0]?.id
  if (!playbackId) return

  const track = videoTrack(asset)
  await applyMediaReadyEvent(db, {
    mediaId,
    providerRef: playbackId,
    kind: "video",
    width: track?.max_width,
    height: track?.max_height,
    durationMs: track?.duration ? Math.round(track.duration * 1000) : undefined,
    posterUrl: muxPosterUrl(playbackId),
  })
  // A short clip's MP4 can be ready with the stream.
  await applyMp4Rendition(db, mediaId, chatMp4File(asset.static_renditions?.files))
}
