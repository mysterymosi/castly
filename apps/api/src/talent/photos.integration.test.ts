import { randomUUID } from "node:crypto"

import { portfolioLayoutFor } from "@workspace/core"
import { schema } from "@workspace/db"
import { PHOTO_SLOTS } from "@workspace/schema"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import type { AuthClient } from "../auth/supabase.js"
import { db } from "../db.js"
import { deckCard } from "../deck/preview.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { appRouter } from "../trpc/router.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []

const stubAuth: AuthClient = {
  requestOtp: async () => {},
  verifyOtp: async () => {
    throw new Error("unused")
  },
  refresh: async () => {
    throw new Error("unused")
  },
}

function caller(userId: string) {
  return appRouter.createCaller({
    db,
    ip: "203.0.113.95",
    requestId: "photos-integration",
    authorization: "Bearer test-token",
    auth: stubAuth,
    verifyAccessToken: async () => ({ userId }),
  })
}

async function talent(suffix: string) {
  const userId = await seedAuthUser(suffix, adult)
  seededUserIds.push(userId)
  const api = caller(userId)
  await api.auth.enableMode({ mode: "talent" })
  await api.talent.studio.get()
  return { userId, api }
}

async function photos(api: ReturnType<typeof caller>, count: number) {
  return (await api.talent.studio.createPlaceholderPhotos({ count })).mediaIds
}

async function profileRow(userId: string) {
  const [row] = await db
    .select()
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)
  if (!row) throw new Error("profile missing")
  return row
}

describe("talent photos", () => {
  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
  })

  it("keeps studio order, Main first, through set, add and reorder", async () => {
    const { api } = await talent("photos-order")
    const [a, b, c, d] = await photos(api, 4)

    const set = await api.talent.photos.set({ mediaIds: [a!, b!, c!] })
    expect(set.talent.photoMediaIds).toEqual([a, b, c])
    expect(Object.keys(set.media)).toEqual(expect.arrayContaining([a, b, c]))

    const added = await api.talent.photos.add({ mediaId: d! })
    expect(added.talent.photoMediaIds).toEqual([a, b, c, d])
    // Adding one already there is a no-op, not a duplicate.
    expect((await api.talent.photos.add({ mediaId: b! })).talent.photoMediaIds).toEqual([a, b, c, d])

    const reordered = await api.talent.photos.set({ mediaIds: [c!, a!, d!] })
    expect(reordered.talent.photoMediaIds).toEqual([c, a, d])
    // A removed photo nothing else uses is deleted in the background; the kept ones stay.
    const mediaRow = (id: string) =>
      db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, id))
    await expect.poll(async () => (await mediaRow(b!)).length, { timeout: 3000 }).toBe(0)
    expect(await mediaRow(a!)).toHaveLength(1)
  })

  it("replaces a photo in its own slot, so a new Main stays Main", async () => {
    const { api } = await talent("photos-replace")
    const [a, b, c, fresh, late] = await photos(api, 5)
    await api.talent.photos.set({ mediaIds: [a!, b!, c!] })

    const replaced = await api.talent.photos.replace({ mediaId: a!, withMediaId: fresh! })
    expect(replaced.talent.photoMediaIds).toEqual([fresh, b, c])

    // The old photo went in the meantime: the replacement takes the next free slot.
    await api.talent.photos.set({ mediaIds: [fresh!, c!] })
    const appended = await api.talent.photos.replace({ mediaId: b!, withMediaId: late! })
    expect(appended.talent.photoMediaIds).toEqual([fresh, c, late])
  })

  it(`holds at most ${PHOTO_SLOTS} and only the talent's own images`, async () => {
    const { userId, api } = await talent("photos-rules")
    const other = await talent("photos-other")
    const mine = await photos(api, PHOTO_SLOTS + 1)

    await api.talent.photos.set({ mediaIds: mine.slice(0, PHOTO_SLOTS) })
    await expect(api.talent.photos.add({ mediaId: mine[PHOTO_SLOTS]! })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(api.talent.photos.set({ mediaIds: mine })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })

    const [theirs] = await photos(other.api, 1)
    await expect(api.talent.photos.add({ mediaId: theirs! })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })

    const video = randomUUID()
    await db.insert(schema.mediaAssets).values({
      id: video,
      ownerId: userId,
      kind: "video",
      provider: "mux",
      providerRef: `playback-${video}`,
      status: "ready",
    })
    await expect(api.talent.photos.set({ mediaIds: [video] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("counts toward quick start and leads the deck card with Main", async () => {
    const { userId, api } = await talent("photos-deck")
    const booker = await talent("photos-booker")
    const [city] = await db.select({ id: schema.cities.id }).from(schema.cities).limit(1)
    const skills = await db.select({ id: schema.skills.id }).from(schema.skills).limit(3)
    if (!city || skills.length < 3) throw new Error("seed cities and skills first")
    const ids = await photos(api, 4)

    const started = await api.talent.studio.completeQuickStart({
      displayName: "Photo Talent",
      cityId: city.id,
      bio: "Model in Lagos.",
      skillIds: skills.map((s) => s.id),
      photoMediaIds: ids.slice(0, 3),
    })
    expect(started.talent.photoMediaIds).toEqual(ids.slice(0, 3))
    expect(started.completeness.quickStartMet).toBe(true)
    // Photos are not a section; the layout is fixed by category (none here, so on-camera).
    expect(started.talent.sections.map((s) => s.type)).toEqual([...portfolioLayoutFor(null)])
    expect(started.talent.sections.every((s) => s.isVisible)).toBe(true)

    await api.talent.photos.set({ mediaIds: [ids[3]!, ids[0]!] })
    const card = await deckCard(db, booker.userId, await profileRow(userId))
    expect(card.decision.leadMediaIds).toEqual([ids[3]])
    expect(card.talent.photoMediaIds).toEqual([ids[3], ids[0]])
    expect(card.media[ids[0]!]?.status).toBe("ready")

    // Two photos left: quick start is no longer met, so publishing would be blocked.
    const fewer = await api.talent.studio.get()
    expect(fewer.completeness.quickStartMet).toBe(false)
  })
})
