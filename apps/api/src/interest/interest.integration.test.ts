import { schema } from "@workspace/db"
import { and, eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import {
  booker,
  caller,
  cleanupDeckFixtures,
  liveTalent,
  role,
  type Caller,
  type World,
  world,
} from "../test/deck-fixtures.js"
import { expireInterests, INTEREST_TTL_DAYS } from "./service.js"

/** Opens a deck session and serves it, returning the position of each talent. */
async function served(api: Caller, input: Parameters<Caller["deck"]["start"]>[0]) {
  const { sessionId } = await api.deck.start(input)
  const page = await api.deck.next({ sessionId, limit: 20 })
  const at = (talentId: string) => page.cards.find((c) => c.talent.profile.userId === talentId)!.position
  return { sessionId, at }
}

/** A live talent who can use the talent-side procedures. */
async function talent(w: World, label: string) {
  const userId = await liveTalent(w, label)
  await db.insert(schema.userModes).values({ userId, mode: "talent" }).onConflictDoNothing()
  return { userId, api: caller(userId) }
}

async function interestsFor(talentId: string) {
  return db.select().from(schema.interests).where(eq(schema.interests.talentId, talentId))
}

async function matchesFor(talentId: string) {
  return db.select().from(schema.matches).where(eq(schema.matches.talentId, talentId))
}

async function verify(bookerId: string) {
  await db
    .update(schema.bookerProfiles)
    .set({ verificationTier: "professional" })
    .where(eq(schema.bookerProfiles.userId, bookerId))
}

async function lapse(interestId: string) {
  await db
    .update(schema.interests)
    .set({ expiresAt: new Date(Date.now() - 60_000), createdAt: new Date(Date.now() - 120_000) })
    .where(eq(schema.interests.id, interestId))
}

describe("a right-swipe sends an interest", () => {
  afterEach(cleanupDeckFixtures)

  it("creates a pending interest with the role and an expiry, and the talent sees it", async () => {
    const w = await world()
    const tunde = await talent(w, "tunde")
    const { userId: bookerId, api } = await booker(w, "int-role")
    const roleId = await role(bookerId, { categoryId: w.categoryId })
    const { sessionId, at } = await served(api, { roleId })

    const result = await api.deck.swipe({ sessionId, position: at(tunde.userId), direction: "interest" })
    expect(result.matchId).toBeNull()

    const [row] = await interestsFor(tunde.userId)
    expect(row).toMatchObject({ bookerId, roleId, status: "pending", respondedAt: null })
    const ttlDays = (row!.expiresAt.getTime() - row!.createdAt.getTime()) / 86_400_000
    expect(Math.round(ttlDays)).toBe(INTEREST_TTL_DAYS)

    const incoming = await tunde.api.interest.listIncoming()
    expect(incoming.autoAccept).toBe(false)
    expect(incoming.interests).toHaveLength(1)
    expect(incoming.interests[0]).toMatchObject({
      id: row!.id,
      headline: "A casting director is interested in you for Lagos Nights",
      booker: { vertical: "casting_director", verificationTier: "phone" },
      role: { id: roleId, name: "Lead", projectName: "Lagos Nights" },
    })
  })

  it("sends a role-less interest too, worded without a project", async () => {
    const w = await world()
    const ada = await talent(w, "ada")
    const { api } = await booker(w, "int-noroll")
    const { sessionId, at } = await served(api, { filters: w.filters })
    await api.deck.swipe({ sessionId, position: at(ada.userId), direction: "interest" })

    const { interests } = await ada.api.interest.listIncoming()
    expect(interests[0]).toMatchObject({ headline: "A casting director is interested in you", role: null })
  })

  it("sends nothing for a pass or a save", async () => {
    const w = await world()
    const a = await talent(w, "pass-me")
    const b = await talent(w, "save-me")
    const { api } = await booker(w, "int-quiet")
    const { sessionId, at } = await served(api, { filters: w.filters })
    await api.deck.swipe({ sessionId, position: at(a.userId), direction: "pass" })
    await api.deck.swipe({ sessionId, position: at(b.userId), direction: "save" })

    expect(await interestsFor(a.userId)).toEqual([])
    expect(await interestsFor(b.userId)).toEqual([])
  })

  it("does not send a second interest while one is open, or after the talent declined", async () => {
    const w = await world()
    const t = await talent(w, "once")
    const { userId: bookerId, api } = await booker(w, "int-dupe")
    const roleId = await role(bookerId, { categoryId: w.categoryId })
    // Sessions opened together, before any swipe: the deck hides a talent once swiped, so this is
    // the only way the same talent is swiped twice for the same role.
    const first = await served(api, { roleId })
    const second = await served(api, { roleId })
    const third = await served(api, { roleId })

    await api.deck.swipe({ sessionId: first.sessionId, position: first.at(t.userId), direction: "interest" })
    await api.deck.swipe({ sessionId: second.sessionId, position: second.at(t.userId), direction: "interest" })
    expect(await interestsFor(t.userId)).toHaveLength(1)

    const [open] = await interestsFor(t.userId)
    await t.api.interest.decline({ interestId: open!.id })
    await api.deck.swipe({ sessionId: third.sessionId, position: third.at(t.userId), direction: "interest" })
    expect(await interestsFor(t.userId)).toHaveLength(1)
  })
})

describe("interest.accept and decline", () => {
  afterEach(cleanupDeckFixtures)

  async function sent(label: string) {
    const w = await world()
    const t = await talent(w, `${label}-talent`)
    const b = await booker(w, `${label}-booker`)
    const roleId = await role(b.userId, { categoryId: w.categoryId })
    const { sessionId, at } = await served(b.api, { roleId })
    await b.api.deck.swipe({ sessionId, position: at(t.userId), direction: "interest" })
    const [row] = await interestsFor(t.userId)
    return { w, t, b, roleId, interest: row! }
  }

  it("accept creates a match, once, and repeating it returns the same one", async () => {
    const { t, b, roleId, interest } = await sent("accept")

    const accepted = await t.api.interest.accept({ interestId: interest.id })
    const again = await t.api.interest.accept({ interestId: interest.id })
    expect(again).toEqual(accepted)

    const matches = await matchesFor(t.userId)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      id: accepted.matchId,
      interestId: interest.id,
      bookerId: b.userId,
      roleId,
    })
    const [row] = await interestsFor(t.userId)
    expect(row).toMatchObject({ status: "accepted" })
    expect(row!.respondedAt).not.toBeNull()
    expect((await t.api.interest.listIncoming()).interests).toEqual([])
  })

  it("decline creates no match and leaves the interest answered", async () => {
    const { t, interest } = await sent("decline")

    expect(await t.api.interest.decline({ interestId: interest.id })).toEqual({
      interestId: interest.id,
      status: "declined",
    })
    expect(await t.api.interest.decline({ interestId: interest.id })).toMatchObject({ status: "declined" })

    expect(await matchesFor(t.userId)).toEqual([])
    expect((await interestsFor(t.userId))[0]).toMatchObject({ status: "declined" })
    expect((await t.api.interest.listIncoming()).interests).toEqual([])
    // Answered is answered: a decline cannot be turned into a match.
    await expect(t.api.interest.accept({ interestId: interest.id })).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("only the talent the interest is for can answer it", async () => {
    const { w, interest } = await sent("stranger")
    const other = await talent(w, "stranger-other")

    await expect(other.api.interest.accept({ interestId: interest.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(other.api.interest.decline({ interestId: interest.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    expect((await other.api.interest.listIncoming()).interests).toEqual([])
  })

  it("is for talents: a booker cannot call it", async () => {
    const { b } = await sent("booker-calls")
    await expect(b.api.interest.listIncoming()).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})

describe("expiry", () => {
  afterEach(cleanupDeckFixtures)

  it("flips a lapsed interest to expired without a match, and a second run changes nothing", async () => {
    const w = await world()
    const t = await talent(w, "lapse")
    const { api } = await booker(w, "lapse-booker")
    const { sessionId, at } = await served(api, { filters: w.filters })
    await api.deck.swipe({ sessionId, position: at(t.userId), direction: "interest" })
    const [row] = await interestsFor(t.userId)
    await lapse(row!.id)

    expect(await expireInterests(db)).toBeGreaterThanOrEqual(1)
    expect(await expireInterests(db)).toBe(0)

    expect((await interestsFor(t.userId))[0]).toMatchObject({ status: "expired", respondedAt: null })
    expect(await matchesFor(t.userId)).toEqual([])
  })

  it("refuses an answer past expiry even before the job has run, and hides it from the list", async () => {
    const w = await world()
    const t = await talent(w, "late")
    const { api } = await booker(w, "late-booker")
    const { sessionId, at } = await served(api, { filters: w.filters })
    await api.deck.swipe({ sessionId, position: at(t.userId), direction: "interest" })
    const [row] = await interestsFor(t.userId)
    await lapse(row!.id)

    expect((await t.api.interest.listIncoming()).interests).toEqual([])
    await expect(t.api.interest.accept({ interestId: row!.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    })
    // The refusal is committed: the interest is now expired, and still has no match.
    expect((await interestsFor(t.userId))[0]).toMatchObject({ status: "expired" })
    expect(await matchesFor(t.userId)).toEqual([])
  })

  it("lets the booker ask again once an interest has lapsed", async () => {
    const w = await world()
    const t = await talent(w, "again")
    const { userId: bookerId, api } = await booker(w, "again-booker")
    const roleId = await role(bookerId, { categoryId: w.categoryId })
    const first = await served(api, { roleId })
    const second = await served(api, { roleId })
    await api.deck.swipe({ sessionId: first.sessionId, position: first.at(t.userId), direction: "interest" })
    await lapse((await interestsFor(t.userId))[0]!.id)

    await api.deck.swipe({ sessionId: second.sessionId, position: second.at(t.userId), direction: "interest" })
    const rows = await interestsFor(t.userId)
    expect(rows.map((r) => r.status).sort()).toEqual(["expired", "pending"])
  })
})

describe("auto-accept", () => {
  afterEach(cleanupDeckFixtures)

  async function swipeAt(w: World, bookerLabel: string, opts: { verified: boolean; autoAccept: boolean }) {
    const t = await talent(w, `${bookerLabel}-talent`)
    const b = await booker(w, bookerLabel)
    if (opts.verified) await verify(b.userId)
    if (opts.autoAccept) await t.api.interest.setAutoAccept({ enabled: true })
    const { sessionId, at } = await served(b.api, { filters: w.filters })
    const result = await b.api.deck.swipe({ sessionId, position: at(t.userId), direction: "interest" })
    return { t, b, result }
  }

  it("matches at once when the talent opted in and the booker is verified", async () => {
    const w = await world()
    const { t, b, result } = await swipeAt(w, "auto-yes", { verified: true, autoAccept: true })

    const [match] = await matchesFor(t.userId)
    expect(match).toMatchObject({ bookerId: b.userId })
    expect(result.matchId).toBe(match!.id)
    const [row] = await interestsFor(t.userId)
    expect(row).toMatchObject({ status: "accepted", id: match!.interestId })
    expect(row!.respondedAt).not.toBeNull()
    expect((await t.api.interest.listIncoming()).interests).toEqual([])
  })

  it("leaves it pending for an unverified booker, or when the talent has not opted in", async () => {
    const w = await world()
    const unverified = await swipeAt(w, "auto-unverified", { verified: false, autoAccept: true })
    const optedOut = await swipeAt(w, "auto-off", { verified: true, autoAccept: false })

    for (const { t, result } of [unverified, optedOut]) {
      expect(result.matchId).toBeNull()
      expect((await interestsFor(t.userId))[0]).toMatchObject({ status: "pending" })
      expect(await matchesFor(t.userId)).toEqual([])
    }
  })

  it("is off by default, and a talent can turn it on and off", async () => {
    const w = await world()
    const t = await talent(w, "toggle")
    expect((await t.api.interest.listIncoming()).autoAccept).toBe(false)
    expect(await t.api.interest.setAutoAccept({ enabled: true })).toEqual({ autoAccept: true })
    expect((await t.api.interest.listIncoming()).autoAccept).toBe(true)
    expect(await t.api.interest.setAutoAccept({ enabled: false })).toEqual({ autoAccept: false })
  })
})

describe("undo", () => {
  afterEach(cleanupDeckFixtures)

  it("withdraws a pending interest", async () => {
    const w = await world()
    const t = await talent(w, "undo-pending")
    const { api } = await booker(w, "undo-pending-booker")
    const { sessionId, at } = await served(api, { filters: w.filters })
    await api.deck.swipe({ sessionId, position: at(t.userId), direction: "interest" })
    expect(await interestsFor(t.userId)).toHaveLength(1)

    await api.deck.undo({ sessionId })
    expect(await interestsFor(t.userId)).toEqual([])
    expect((await t.api.interest.listIncoming()).interests).toEqual([])
  })

  it("refuses once the talent has answered, leaving the swipe and the match as they were", async () => {
    const w = await world()
    const t = await talent(w, "undo-answered")
    const { api } = await booker(w, "undo-answered-booker")
    const { sessionId, at } = await served(api, { filters: w.filters })
    await api.deck.swipe({ sessionId, position: at(t.userId), direction: "interest" })
    const [row] = await interestsFor(t.userId)
    await t.api.interest.accept({ interestId: row!.id })

    await expect(api.deck.undo({ sessionId })).rejects.toMatchObject({ code: "CONFLICT" })
    expect(await matchesFor(t.userId)).toHaveLength(1)
    const live = await db
      .select({ id: schema.swipes.id })
      .from(schema.swipes)
      .where(and(eq(schema.swipes.sessionId, sessionId), eq(schema.swipes.talentId, t.userId)))
    expect(live).toHaveLength(1)
  })
})
