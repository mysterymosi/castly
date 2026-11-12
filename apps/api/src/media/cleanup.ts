import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { and, eq, inArray, lt, sql } from "drizzle-orm"

import { supabaseMediaBucket, supabaseStorageBase } from "./config.js"
import { muxClient, muxConfigured } from "./mux-client.js"

/**
 * Deletes media nothing uses any more: the provider's file, then the row. Run in the background
 * after a photo is removed or replaced (`scheduleMediaCleanup`), and as a sweep for uploads that
 * were never attached (`scripts/media-cleanup.ts`). Stored photos of a person should not outlive
 * their use (NDPA); the storage bill agrees.
 *
 * "In use" is anything that can show a media id: a photo slot, a section config (`mediaId`,
 * `mediaIds`), the card config (canvas, the old lead), `section_media`. A media row with any of
 * those is never touched. The provider file is deleted first; if that fails the row stays, so a
 * later sweep tries again rather than leaving an orphaned file nobody can find.
 */

type MediaRow = typeof schema.mediaAssets.$inferSelect

/** How long an upload may sit unattached before the sweep treats it as abandoned. */
export const UNATTACHED_GRACE_MS = 24 * 60 * 60 * 1000

/** Of `ids`, those something still uses. */
async function referencedMediaIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const idArray = sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  )}]`
  const rows = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT id::text FROM (
      SELECT media_id AS id FROM talent_photos WHERE media_id = ANY(${idArray})
      UNION ALL
      SELECT media_id FROM section_media WHERE media_id = ANY(${idArray})
      UNION ALL
      SELECT (config->>'mediaId')::uuid FROM portfolio_sections
        WHERE config->>'mediaId' IS NOT NULL AND (config->>'mediaId')::uuid = ANY(${idArray})
      UNION ALL
      SELECT m.value::uuid FROM portfolio_sections ps,
        jsonb_array_elements_text(CASE WHEN jsonb_typeof(ps.config->'mediaIds') = 'array'
          THEN ps.config->'mediaIds' ELSE '[]'::jsonb END) AS m(value)
        WHERE m.value::uuid = ANY(${idArray})
      UNION ALL
      SELECT (card_config->>'canvasMediaId')::uuid FROM talent_profiles
        WHERE card_config->>'canvasMediaId' IS NOT NULL
          AND (card_config->>'canvasMediaId')::uuid = ANY(${idArray})
      UNION ALL
      SELECT (card_config->>'leadMediaId')::uuid FROM talent_profiles
        WHERE card_config->>'leadMediaId' IS NOT NULL
          AND (card_config->>'leadMediaId')::uuid = ANY(${idArray})
    ) used
  `)
  return new Set(rows.map((row) => row.id))
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set")
  return { apikey: key, Authorization: `Bearer ${key}` }
}

/** Deletes the provider's copy. A file already gone counts as deleted. */
export async function deleteProviderFile(row: MediaRow): Promise<void> {
  const ref = row.providerRef
  // No file: placeholders, never-started uploads, and the local backend (which keeps no bytes).
  if (!ref || ref.startsWith("local-")) return

  if (row.provider === "supabase") {
    const response = await fetch(
      `${supabaseStorageBase()}/object/${supabaseMediaBucket()}/${ref}`,
      { method: "DELETE", headers: supabaseHeaders() }
    )
    if (response.ok || response.status === 404) return
    // Storage answers a missing object with 400 "Object not found"; any other 400 is real.
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
    if (response.status === 400 && /not found/i.test(`${body.message ?? ""} ${body.error ?? ""}`)) return
    throw new Error(`Supabase Storage delete failed (${response.status}): ${body.message ?? "unknown"}`)
  }

  if (row.provider === "cf_images") {
    const token = process.env.CF_API_TOKEN
    const account = process.env.CF_ACCOUNT_ID
    if (!token || !account) throw new Error("Cloudflare is not configured")
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/images/v1/${ref}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    )
    if (!response.ok && response.status !== 404) {
      throw new Error(`Cloudflare Images delete failed (${response.status})`)
    }
    return
  }

  // Mux: a ready video's ref is its playback id; before that, the direct-upload id.
  if (!muxConfigured()) throw new Error("Mux is not configured")
  const mux = muxClient()
  const notFound = (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error && error.status === 404
  try {
    if (row.status === "ready") {
      const playback = await mux.video.playbackIds.retrieve(ref)
      if (playback.object?.type === "asset") await mux.video.assets.delete(playback.object.id)
      return
    }
    const upload = await mux.video.uploads.retrieve(ref)
    if (upload.asset_id) await mux.video.assets.delete(upload.asset_id)
    else if (upload.status === "waiting") await mux.video.uploads.cancel(ref)
  } catch (error) {
    if (!notFound(error)) throw error
  }
}

/**
 * Deletes each of `ids` that nothing uses, owned by `ownerId` when given. Returns the ids
 * deleted. A provider failure skips that media (logged) and carries on with the rest.
 */
export async function deleteUnusedMedia(
  db: Db,
  ids: string[],
  options: { ownerId?: string; deleteFile?: (row: MediaRow) => Promise<void> } = {}
): Promise<string[]> {
  if (ids.length === 0) return []
  const deleteFile = options.deleteFile ?? deleteProviderFile
  const rows = await db
    .select()
    .from(schema.mediaAssets)
    .where(
      and(
        inArray(schema.mediaAssets.id, ids),
        options.ownerId ? eq(schema.mediaAssets.ownerId, options.ownerId) : undefined
      )
    )
  const used = await referencedMediaIds(db, rows.map((row) => row.id))
  const deleted: string[] = []
  for (const row of rows) {
    if (used.has(row.id)) continue
    try {
      await deleteFile(row)
    } catch (error) {
      console.error("media cleanup: provider delete failed", {
        mediaId: row.id,
        provider: row.provider,
        error: error instanceof Error ? error.message : "unknown",
      })
      continue
    }
    // Re-checked inside the delete: a photo slot taken since the check keeps its media.
    const removed = await db
      .delete(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.id, row.id),
          sql`NOT EXISTS (SELECT 1 FROM talent_photos WHERE media_id = ${row.id})`
        )
      )
      .returning({ id: schema.mediaAssets.id })
    if (removed.length > 0) deleted.push(row.id)
  }
  return deleted
}

/** After a photo is removed or replaced: deletes what is no longer used, off the request path. */
export function scheduleMediaCleanup(db: Db, ownerId: string, ids: string[]) {
  if (ids.length === 0) return
  deleteUnusedMedia(db, ids, { ownerId }).catch((error: unknown) => {
    console.error("media cleanup failed", error instanceof Error ? error.message : "unknown")
  })
}

/** The sweep: media older than the grace period that nothing uses, in batches. */
export async function sweepUnusedMedia(
  db: Db,
  options: {
    now?: Date
    graceMs?: number
    batch?: number
    /** Only this owner's media (tests, and a talent's own cleanup). */
    ownerId?: string
    /** Replaces the provider delete; throwing skips that media (the dry run uses this). */
    deleteFileOverride?: (mediaId: string) => Promise<void>
  } = {}
) {
  const cutoff = new Date((options.now ?? new Date()).getTime() - (options.graceMs ?? UNATTACHED_GRACE_MS))
  const candidates = await db
    .select({ id: schema.mediaAssets.id })
    .from(schema.mediaAssets)
    .where(
      and(
        lt(schema.mediaAssets.createdAt, cutoff),
        options.ownerId ? eq(schema.mediaAssets.ownerId, options.ownerId) : undefined
      )
    )
    .limit(options.batch ?? 500)
  const override = options.deleteFileOverride
  return deleteUnusedMedia(db, candidates.map((row) => row.id), {
    ownerId: options.ownerId,
    deleteFile: override ? (row) => override(row.id) : undefined,
  })
}
