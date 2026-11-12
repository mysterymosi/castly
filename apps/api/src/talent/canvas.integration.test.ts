import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
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

function talentCaller(userId: string) {
  return appRouter.createCaller({
    db,
    ip: "203.0.113.92",
    requestId: "canvas-integration",
    authorization: "Bearer test-token",
    auth: stubAuth,
    verifyAccessToken: async () => ({ userId }),
  })
}

async function talent(suffix: string) {
  const userId = await seedAuthUser(suffix, adult)
  seededUserIds.push(userId)
  const api = talentCaller(userId)
  await api.auth.enableMode({ mode: "talent" })
  await api.talent.studio.get()
  return { userId, api }
}

async function video(
  ownerId: string,
  shape: { width: number | null; height: number | null; durationMs: number | null },
  status: "ready" | "processing" = "ready"
) {
  const id = randomUUID()
  await db.insert(schema.mediaAssets).values({
    id,
    ownerId,
    kind: "video",
    provider: "mux",
    providerRef: `playback-${id}`,
    status,
    ...shape,
  })
  return id
}

const vertical = { width: 1080, height: 1920, durationMs: 6_000 }

describe("studio canvas", () => {
  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
  })

  it("sets a vertical loop, keeps it through profile edits, and clears it", async () => {
    const { userId, api } = await talent("canvas-set")
    const mediaId = await video(userId, vertical)

    const set = await api.talent.studio.setCanvas({ mediaId })
    expect(set.talent.profile.cardConfig.canvasMediaId).toBe(mediaId)
    expect(set.media[mediaId]?.kind).toBe("video")

    const edited = await api.talent.studio.updateProfile({
      cardConfig: { highlightFacts: ["Fluent Yoruba"] },
    })
    expect(edited.talent.profile.cardConfig.canvasMediaId).toBe(mediaId)

    const cleared = await api.talent.studio.setCanvas({ mediaId: null })
    expect(cleared.talent.profile.cardConfig.canvasMediaId).toBeNull()
  })

  it("rejects media outside the spec or owned by someone else", async () => {
    const { userId, api } = await talent("canvas-reject")
    const other = await talent("canvas-other")

    const landscape = await video(userId, { width: 1920, height: 1080, durationMs: 6_000 })
    await expect(api.talent.studio.setCanvas({ mediaId: landscape })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/9:16/),
    })
    const long = await video(userId, { ...vertical, durationMs: 30_000 })
    await expect(api.talent.studio.setCanvas({ mediaId: long })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    const theirs = await video(other.userId, vertical)
    await expect(api.talent.studio.setCanvas({ mediaId: theirs })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("puts the canvas on the deck card only once it is ready and in spec", async () => {
    const { userId, api } = await talent("canvas-deck")
    const booker = await talent("canvas-booker")
    const profileRow = async () => {
      const [row] = await db
        .select()
        .from(schema.talentProfiles)
        .where(eq(schema.talentProfiles.userId, userId))
        .limit(1)
      if (!row) throw new Error("profile missing")
      return row
    }

    // Set while processing (unmeasured), then measured out of spec: the card falls back to photos.
    const mediaId = await video(userId, { width: null, height: null, durationMs: null }, "processing")
    await api.talent.studio.setCanvas({ mediaId })
    expect((await deckCard(db, booker.userId, await profileRow())).decision.canvasMediaId).toBeNull()

    await db
      .update(schema.mediaAssets)
      .set({ status: "ready", width: 1920, height: 1080, durationMs: 6_000 })
      .where(eq(schema.mediaAssets.id, mediaId))
    expect((await deckCard(db, booker.userId, await profileRow())).decision.canvasMediaId).toBeNull()

    await db
      .update(schema.mediaAssets)
      .set(vertical)
      .where(eq(schema.mediaAssets.id, mediaId))
    const card = await deckCard(db, booker.userId, await profileRow())
    expect(card.decision.canvasMediaId).toBe(mediaId)
    expect(card.media[mediaId]?.playbackUrl).toBeTruthy()

    // The talent can turn the canvas off in the studio: the card shows photos, the canvas stays.
    const off = await api.talent.studio.updateProfile({ cardConfig: { canvasEnabled: false } })
    expect(off.talent.profile.cardConfig).toMatchObject({ canvasEnabled: false, canvasMediaId: mediaId })
    expect((await deckCard(db, booker.userId, await profileRow())).decision.canvasMediaId).toBeNull()
    await api.talent.studio.updateProfile({ cardConfig: { canvasEnabled: true } })
    expect((await deckCard(db, booker.userId, await profileRow())).decision.canvasMediaId).toBe(mediaId)
  })
})
