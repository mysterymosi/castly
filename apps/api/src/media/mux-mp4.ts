import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { and, asc, eq, lt } from "drizzle-orm"

import { CHAT_MP4_RESOLUTION } from "./mux.js"
import { muxClient, muxConfigured } from "./mux-client.js"

/**
 * A chat video's MP4 (M6): Mux makes it after the stream, sometimes minutes later. Its webhooks
 * record it as it lands; `syncPreparingMp4s` asks Mux directly for any still waiting, so it also
 * arrives where webhooks don't reach (local development) or one was missed.
 */

type RenditionFile = {
  name?: string
  resolution?: string
  status?: string
}

/** How long a rendition may stay "preparing" before the sweep stops asking and calls it errored. */
const GIVE_UP_AFTER_MS = 2 * 24 * 60 * 60 * 1000

/** The chat MP4 among an asset's static renditions, if Mux lists it. */
export function chatMp4File(files: RenditionFile[] | undefined) {
  return files?.find((file) => file.resolution === CHAT_MP4_RESOLUTION)
}

/**
 * Records what Mux reports for a media's chat MP4. Only a row still preparing changes, so a late
 * or repeated event can't undo a settled one.
 */
export async function applyMp4Rendition(db: Db, mediaId: string, file: RenditionFile | undefined) {
  if (!file || file.resolution !== CHAT_MP4_RESOLUTION) return
  const settled =
    file.status === "ready" && file.name
      ? { mp4Status: "ready" as const, mp4Name: file.name }
      : file.status === "skipped"
        ? { mp4Status: "skipped" as const }
        : file.status === "errored"
          ? { mp4Status: "errored" as const }
          : null
  if (!settled) return
  await db
    .update(schema.mediaAssets)
    .set({ ...settled, updatedAt: new Date() })
    .where(and(eq(schema.mediaAssets.id, mediaId), eq(schema.mediaAssets.mp4Status, "preparing")))
}

/** The sweep: asks Mux about chat MP4s still preparing on videos that are ready. */
export async function syncPreparingMp4s(db: Db, options: { now?: Date; batch?: number } = {}) {
  if (!muxConfigured()) return { checked: 0 }
  const now = options.now ?? new Date()
  const media = schema.mediaAssets

  await db
    .update(media)
    .set({ mp4Status: "errored", updatedAt: now })
    .where(
      and(
        eq(media.mp4Status, "preparing"),
        lt(media.createdAt, new Date(now.getTime() - GIVE_UP_AFTER_MS)),
      ),
    )

  const rows = await db
    .select({ id: media.id, playbackId: media.providerRef })
    .from(media)
    .where(
      and(
        eq(media.mp4Status, "preparing"),
        eq(media.provider, "mux"),
        eq(media.status, "ready"),
      ),
    )
    .orderBy(asc(media.createdAt))
    .limit(options.batch ?? 25)

  const mux = muxClient()
  for (const row of rows) {
    if (!row.playbackId) continue
    try {
      // A ready video's ref is its playback id; the asset behind it lists the renditions.
      const playback = await mux.video.playbackIds.retrieve(row.playbackId)
      if (playback.object?.type !== "asset") continue
      const asset = await mux.video.assets.retrieve(playback.object.id)
      await applyMp4Rendition(db, row.id, chatMp4File(asset.static_renditions?.files))
    } catch (error) {
      console.error("mp4 sync failed", {
        mediaId: row.id,
        error: error instanceof Error ? error.message : "unknown",
      })
    }
  }
  return { checked: rows.length }
}
