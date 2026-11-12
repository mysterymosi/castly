import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import { PHOTO_SLOTS } from "@workspace/schema"
import { and, asc, count, eq } from "drizzle-orm"

import { getMediaStatuses } from "../media/service.js"
import { StudioError } from "./errors.js"

/**
 * The talent's photos (`talent_photos`), Main first. Only the talent's own images that did not
 * fail; a photo still processing is allowed, since the renderers show only ready media.
 */
async function assertPhotos(db: Db, userId: string, mediaIds: string[]) {
  if (mediaIds.length === 0) return
  const media = await getMediaStatuses(db, userId, mediaIds)
  for (const id of mediaIds) {
    const row = media[id]
    if (!row) throw new StudioError("Photo not found", "invalid_photo")
    if (row.kind !== "image") throw new StudioError("Only photos go here", "invalid_photo")
    if (row.status === "failed" || row.status === "quarantined")
      throw new StudioError("That photo didn't go through", "invalid_photo")
  }
}

/**
 * Replaces every photo, in order. Returns the photos left out, whose media the caller hands to
 * `scheduleMediaCleanup` (deleted unless something else still uses it).
 */
export async function writeTalentPhotos(db: Db, userId: string, mediaIds: string[]): Promise<string[]> {
  if (mediaIds.length > PHOTO_SLOTS)
    throw new StudioError(`At most ${PHOTO_SLOTS} photos`, "photo_slots_full")
  if (new Set(mediaIds).size !== mediaIds.length)
    throw new StudioError("Each photo once", "invalid_photo")
  await assertPhotos(db, userId, mediaIds)
  return db.transaction(async (tx) => {
    const before = await tx
      .select({ mediaId: schema.talentPhotos.mediaId })
      .from(schema.talentPhotos)
      .where(eq(schema.talentPhotos.talentId, userId))
    await tx.delete(schema.talentPhotos).where(eq(schema.talentPhotos.talentId, userId))
    if (mediaIds.length > 0) {
      await tx
        .insert(schema.talentPhotos)
        .values(mediaIds.map((mediaId, position) => ({ talentId: userId, mediaId, position })))
    }
    const kept = new Set(mediaIds)
    return before.map((row) => row.mediaId).filter((id) => !kept.has(id))
  })
}

/**
 * Appends one photo in the next free slot. Done in one transaction against the stored list, so
 * uploads finishing together each get their own slot instead of overwriting each other.
 */
export async function appendTalentPhoto(db: Db, userId: string, mediaId: string) {
  await assertPhotos(db, userId, [mediaId])
  await db.transaction(async (tx) => {
    // Serialises appends for one talent (the profile row is the lock, as the search refresh uses).
    await tx
      .select({ userId: schema.talentProfiles.userId })
      .from(schema.talentProfiles)
      .where(eq(schema.talentProfiles.userId, userId))
      .for("update")
    const rows = await tx
      .select({ mediaId: schema.talentPhotos.mediaId, position: schema.talentPhotos.position })
      .from(schema.talentPhotos)
      .where(eq(schema.talentPhotos.talentId, userId))
      .orderBy(asc(schema.talentPhotos.position))
    if (rows.some((row) => row.mediaId === mediaId)) return
    if (rows.length >= PHOTO_SLOTS)
      throw new StudioError(`All ${PHOTO_SLOTS} photo slots are full`, "photo_slots_full")
    const position = (rows.at(-1)?.position ?? -1) + 1
    await tx.insert(schema.talentPhotos).values({ talentId: userId, mediaId, position })
  })
}

/**
 * Swaps `withMediaId` into `mediaId`'s slot, keeping its place (a new Main stays Main). If the
 * old photo was removed meanwhile, the new one takes the next free slot instead. Returns the
 * photo taken out, if any, for `scheduleMediaCleanup`.
 */
export async function replaceTalentPhoto(
  db: Db,
  userId: string,
  mediaId: string,
  withMediaId: string
): Promise<string[]> {
  await assertPhotos(db, userId, [withMediaId])
  let appended = false
  let replaced = false
  await db.transaction(async (tx) => {
    await tx
      .select({ userId: schema.talentProfiles.userId })
      .from(schema.talentProfiles)
      .where(eq(schema.talentProfiles.userId, userId))
      .for("update")
    const rows = await tx
      .select({ mediaId: schema.talentPhotos.mediaId, position: schema.talentPhotos.position })
      .from(schema.talentPhotos)
      .where(eq(schema.talentPhotos.talentId, userId))
      .orderBy(asc(schema.talentPhotos.position))
    if (rows.some((row) => row.mediaId === withMediaId)) return
    const old = rows.find((row) => row.mediaId === mediaId)
    if (!old) {
      appended = true
      return
    }
    await tx
      .delete(schema.talentPhotos)
      .where(and(eq(schema.talentPhotos.talentId, userId), eq(schema.talentPhotos.mediaId, mediaId)))
    await tx.insert(schema.talentPhotos).values({ talentId: userId, mediaId: withMediaId, position: old.position })
    replaced = true
  })
  if (appended) await appendTalentPhoto(db, userId, withMediaId)
  return replaced ? [mediaId] : []
}

export async function countTalentPhotos(db: Db, userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.talentPhotos)
    .where(eq(schema.talentPhotos.talentId, userId))
  return row?.n ?? 0
}
