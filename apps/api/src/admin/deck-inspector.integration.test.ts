import { schema } from "@workspace/db"
import { count, eq, inArray } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import { startDeck } from "../deck/session.js"
import {
  booker,
  caller,
  cleanupDeckFixtures,
  liveTalent,
  newUser,
  queue,
  tag,
  world,
  type World,
} from "../test/deck-fixtures.js"

/** Admin mode is granted by ops, never self-enabled, so tests write the row directly. */
async function admin(label: string) {
  const userId = await newUser(label)
  await db.insert(schema.userModes).values({ userId, mode: "admin" })
  return caller(userId)
}

/** Five live talents with different quality, so stage 2 alone gives a clear order. */
async function talents(w: World, prefix: string) {
  const ids: string[] = []
  for (const quality of [100, 80, 60, 40, 20]) {
    const id = await liveTalent(w, `${prefix}-${quality}`)
    await db.update(schema.talentSearch).set({ qualityScore: String(quality) }).where(eq(schema.talentSearch.talentId, id))
    ids.push(id)
  }
  return ids
}

// The settings tests change live rows; put back whatever the database had.
let savedSettings: (typeof schema.rankingWeights.$inferSelect)[] = []
beforeEach(async () => {
  savedSettings = await db.select().from(schema.rankingWeights)
})
afterEach(async () => {
  await db.delete(schema.rankingWeights)
  if (savedSettings.length > 0) await db.insert(schema.rankingWeights).values(savedSettings)
  await cleanupDeckFixtures()
})

describe("admin.deck", () => {
  it("explains card #3 with exactly the reasons deck.start stored for it", async () => {
    const w = await world()
    await talents(w, "explain")
    const { userId } = await booker(w, "inspected")
    const ops = await admin("inspector")

    const seed = 4242
    const { sessionId } = await startDeck(db, userId, { roleId: null, goalCount: null, filters: w.filters }, seed)
    const stored = await queue(sessionId)
    const run = await ops.admin.deck.run({ bookerId: userId, filters: w.filters, seed })

    expect(run.seed).toBe(seed)
    expect(run.candidates).toBe(stored.length)
    expect(run.cards.map((c) => c.card.talent.profile.userId)).toEqual(stored.map((r) => r.talentId))
    const third = run.cards[3]!
    expect(third.reasons).toEqual(stored[3]!.reasons)
    expect(third.score).toBeCloseTo(Number(stored[3]!.score), 4)
    // The breakdown adds up: every positive component appears as a reason with that contribution.
    for (const [code, value] of Object.entries(third.components)) {
      if (value > 0) expect(third.reasons).toContainEqual(expect.objectContaining({ code, contribution: value }))
    }

    const session = await ops.admin.deck.session({ sessionId })
    expect(session.session).toMatchObject({ bookerId: userId, seed, queued: stored.length })
    expect(session.cards[3]).toMatchObject({ position: 3, reasons: stored[3]!.reasons, servedAt: null, decision: null })
    expect(session.cards[3]!.card!.talent.profile.userId).toBe(stored[3]!.talentId)

    const { sessions } = await ops.admin.deck.booker({ bookerId: userId })
    expect(sessions).toEqual([expect.objectContaining({ id: sessionId, seed, queued: stored.length, served: 0 })])
  })

  it("writes nothing: no session, queue, impressions or exposure", async () => {
    const w = await world()
    const ids = await talents(w, "dry")
    const { userId } = await booker(w, "dry-booker")
    const ops = await admin("dry-inspector")

    const before = await Promise.all([
      db.select({ n: count() }).from(schema.deckSessions).where(eq(schema.deckSessions.bookerId, userId)),
      db.select({ n: count() }).from(schema.deckImpressions).where(inArray(schema.deckImpressions.talentId, ids)),
      db
        .select({ n: count() })
        .from(schema.talentExposureDaily)
        .where(inArray(schema.talentExposureDaily.talentId, ids)),
    ])
    const run = await ops.admin.deck.run({ bookerId: userId, filters: w.filters })
    expect(run.cards).toHaveLength(5)
    const after = await Promise.all([
      db.select({ n: count() }).from(schema.deckSessions).where(eq(schema.deckSessions.bookerId, userId)),
      db.select({ n: count() }).from(schema.deckImpressions).where(inArray(schema.deckImpressions.talentId, ids)),
      db
        .select({ n: count() })
        .from(schema.talentExposureDaily)
        .where(inArray(schema.talentExposureDaily.talentId, ids)),
    ])
    expect(after).toEqual(before)
  })

  it("tries settings for one run without saving them", async () => {
    const w = await world()
    await talents(w, "override")
    const { userId } = await booker(w, "override-booker")
    const ops = await admin("override-inspector")

    const run = await ops.admin.deck.run({
      bookerId: userId,
      filters: w.filters,
      overrides: [{ key: "w_quality", value: 0 }],
    })
    expect(run.cards.every((c) => c.components.quality === 0)).toBe(true)
    expect(run.settings).toContainEqual({ key: "w_quality", value: 0 })
    const { settings } = await ops.admin.rankingWeights.list()
    expect(settings.find((s) => s.key === "w_quality")?.value).not.toBe(0)

    await expect(
      ops.admin.deck.run({ bookerId: userId, overrides: [{ key: "exploration_fraction", value: 2 }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("finds bookers by email and is closed to non-admins", async () => {
    const w = await world()
    const label = `findme-${tag()}`
    const { userId, api } = await booker(w, label)
    const ops = await admin("search-inspector")

    const { bookers } = await ops.admin.bookers.search({ query: label })
    expect(bookers.map((b) => b.id)).toEqual([userId])
    await expect(ops.admin.deck.booker({ bookerId: crypto.randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(api.admin.deck.run({ bookerId: userId })).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(api.admin.rankingWeights.list()).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})

describe("admin.rankingWeights", () => {
  it("saves a weight that the next deck uses at once, and resets it to the default", async () => {
    const w = await world()
    await talents(w, "live-edit")
    const { userId } = await booker(w, "live-edit-booker")
    const ops = await admin("weights-editor")

    const saved = await ops.admin.rankingWeights.update({ key: "w_geo", value: 0.35 })
    const geo = saved.settings.find((s) => s.key === "w_geo")!
    expect(geo).toMatchObject({ value: 0.35, defaultValue: 0.6, group: "scoring" })
    expect(geo.updatedBy).toMatch(/weights-editor/)

    // Every talent is in the booker's city, so each gets the whole geo weight.
    const run = await ops.admin.deck.run({ bookerId: userId, filters: w.filters })
    expect(run.cards.every((c) => c.components.geo === 0.35)).toBe(true)

    const reset = await ops.admin.rankingWeights.update({ key: "w_geo", value: null })
    expect(reset.settings.find((s) => s.key === "w_geo")!.value).toBeNull()
    const after = await ops.admin.deck.run({ bookerId: userId, filters: w.filters })
    expect(after.cards.every((c) => c.components.geo === 0.6)).toBe(true)
  })

  it("refuses values the deck would ignore", async () => {
    const ops = await admin("weights-guard")
    await expect(ops.admin.rankingWeights.update({ key: "diversity_max_run", value: 2.5 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(ops.admin.rankingWeights.update({ key: "w_made_up", value: 1 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(ops.admin.rankingWeights.update({ key: "w_made_up", value: null })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })
})
