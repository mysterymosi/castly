import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { eq } from "drizzle-orm"

import { muxPosterUrl } from "./delivery.js"
import { muxClient } from "./mux-client.js"
import { applyMediaReadyEvent, markMediaProcessing } from "./service.js"

function videoTrack(asset: {
  tracks?: Array<{
    type?: string
    max_width?: number
    max_height?: number
    duration?: number
  }>
}) {
  return asset.tracks?.find((track) => track.type === "video")
}

export async function syncMuxVideoIfReady(
  db: Db,
  row: typeof schema.mediaAssets.$inferSelect
) {
  if (row.kind !== "video" || row.provider !== "mux" || !row.providerRef) return
  if (row.status === "ready" || row.status === "failed") return

  const mux = muxClient()
  const upload = await mux.video.uploads.retrieve(row.providerRef)
  if (upload.status === "errored") {
    await db
      .update(schema.mediaAssets)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(schema.mediaAssets.id, row.id))
    return
  }
  if (!upload.asset_id) return

  await markMediaProcessing(db, row.id)
  const asset = await mux.video.assets.retrieve(upload.asset_id)
  if (asset.status !== "ready") return

  const playbackId = asset.playback_ids?.[0]?.id
  if (!playbackId) return

  const track = videoTrack(asset)
  await applyMediaReadyEvent(db, {
    mediaId: row.id,
    providerRef: playbackId,
    kind: "video",
    width: track?.max_width,
    height: track?.max_height,
    durationMs: track?.duration ? Math.round(track.duration * 1000) : undefined,
    posterUrl: muxPosterUrl(playbackId),
  })
}
