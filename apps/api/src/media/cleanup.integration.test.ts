import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { eq, inArray } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { deleteUnusedMedia, sweepUnusedMedia } from "./cleanup.js"

const seededUserIds: string[] = []

async function owner(suffix: string) {
  const userId = await seedAuthUser(suffix, "1990-01-01")
  seededUserIds.push(userId)
  await db.insert(schema.talentProfiles).values({ userId, slug: `t-${randomUUID().slice(0, 8)}`, displayName: "T" })
  return userId
}

async function media(ownerId: string, createdAt = new Date()) {
  const id = randomUUID()
  await db.insert(schema.mediaAssets).values({
    id,
    ownerId,
    kind: "image",
    provider: "supabase",
    providerRef: `images/${ownerId}/${id}`,
    status: "ready",
    createdAt,
  })
  return id
}

async function exists(ids: string[]) {
  const rows = await db
    .select({ id: schema.mediaAssets.id })
    .from(schema.mediaAssets)
    .where(inArray(schema.mediaAssets.id, ids))
  return new Set(rows.map((row) => row.id))
}

/** Records provider deletes instead of calling Supabase. */
function recorder() {
  const deleted: string[] = []
  return { deleted, deleteFile: async (row: { id: string }) => void deleted.push(row.id) }
}

describe("media cleanup", () => {
  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
  })

  it("deletes the file and row of unused media, and keeps anything still in use", async () => {
    const userId = await owner("cleanup-use")
    const [unused, photo, inSection, inGallery, canvas] = await Promise.all(
      Array.from({ length: 5 }, () => media(userId))
    )
    await db.insert(schema.talentPhotos).values({ talentId: userId, mediaId: photo!, position: 0 })
    await db.insert(schema.portfolioSections).values([
      { talentId: userId, type: "about", position: 0, config: { mediaId: inSection } },
      { talentId: userId, type: "custom", position: 1, config: { mediaIds: [inGallery] } },
    ])
    await db
      .update(schema.talentProfiles)
      .set({ cardConfig: { canvasMediaId: canvas, highlightFacts: [] } })
      .where(eq(schema.talentProfiles.userId, userId))

    const ids = [unused!, photo!, inSection!, inGallery!, canvas!]
    const files = recorder()
    const deleted = await deleteUnusedMedia(db, ids, { ownerId: userId, deleteFile: files.deleteFile })
    expect(deleted).toEqual([unused])
    expect(files.deleted).toEqual([unused])
    const left = await exists(ids)
    expect(left.has(unused!)).toBe(false)
    for (const id of [photo, inSection, inGallery, canvas]) expect(left.has(id!)).toBe(true)
  })

  it("keeps the row when the provider delete fails, so a later run retries", async () => {
    const userId = await owner("cleanup-fail")
    const id = await media(userId)
    const deleted = await deleteUnusedMedia(db, [id], {
      deleteFile: async () => {
        throw new Error("provider down")
      },
    })
    expect(deleted).toEqual([])
    expect((await exists([id])).has(id)).toBe(true)
  })

  it("only touches another owner's media when no owner is given", async () => {
    const userId = await owner("cleanup-owner")
    const other = await owner("cleanup-other")
    const theirs = await media(other)
    const files = recorder()
    expect(await deleteUnusedMedia(db, [theirs], { ownerId: userId, deleteFile: files.deleteFile })).toEqual([])
    expect((await exists([theirs])).has(theirs)).toBe(true)
  })

  it("sweeps unused media past the grace period, not fresh uploads", async () => {
    const userId = await owner("cleanup-sweep")
    const now = new Date()
    const old = await media(userId, new Date(now.getTime() - 25 * 60 * 60 * 1000))
    const fresh = await media(userId, new Date(now.getTime() - 60 * 1000))
    const files = recorder()
    const deleted = await sweepUnusedMedia(db, {
      now,
      // Scoped to the test's owner: never sweep the rest of the database from a test.
      ownerId: userId,
      deleteFileOverride: async (mediaId) => void files.deleted.push(mediaId),
    })
    expect(deleted).toContain(old)
    expect(deleted).not.toContain(fresh)
    expect((await exists([fresh])).has(fresh)).toBe(true)
  })
})
