import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import {
  booker,
  caller,
  cleanupDeckFixtures,
  liveTalent,
  newUser,
  role,
  type World,
  world,
} from "../test/deck-fixtures.js"

const BRIEF = "Lead in a Lagos-set drama. Three shoot days, one overnight."

/** A booker and talent matched on a role that has a brief, a shoot window, a rate and requirements. */
async function matched(label: string, w?: World) {
  w ??= await world()
  const talentId = await liveTalent(w, `${label}-talent`)
  await db.insert(schema.userModes).values({ userId: talentId, mode: "talent" }).onConflictDoNothing()
  const talent = { userId: talentId, api: caller(talentId) }
  const b = await booker(w, `${label}-booker`)
  const roleId = await role(b.userId, { categoryId: w.categoryId, brief: BRIEF })
  await db
    .update(schema.roles)
    .set({
      shootStartsOn: "2027-03-01",
      shootEndsOn: "2027-03-03",
      rateMin: "150000",
      rateMax: "250000",
      requirements: { complexion: { anyOf: ["deep"] } },
    })
    .where(eq(schema.roles.id, roleId))

  const { sessionId } = await b.api.deck.start({ roleId })
  const page = await b.api.deck.next({ sessionId, limit: 20 })
  const position = page.cards.find((c) => c.talent.profile.userId === talentId)!.position
  await b.api.deck.swipe({ sessionId, position, direction: "interest" })
  const [interest] = await db.select().from(schema.interests).where(eq(schema.interests.talentId, talentId))
  const { matchId } = await talent.api.interest.accept({ interestId: interest!.id })
  return { w, talent, booker: b, roleId, matchId }
}

describe("match.attachBrief", () => {
  afterEach(cleanupDeckFixtures)

  it("shows the talent the brief once the booker attaches it", async () => {
    const m = await matched("attach")
    const before = await m.talent.api.match.get({ matchId: m.matchId })
    expect(before).toMatchObject({ brief: null, briefAttachedAt: null, roleId: m.roleId })

    await m.booker.api.match.attachBrief({ matchId: m.matchId })

    const seen = await m.talent.api.match.get({ matchId: m.matchId })
    expect(seen.brief).toEqual({
      roleId: m.roleId,
      roleName: "Lead",
      projectName: "Lagos Nights",
      projectType: null,
      brief: BRIEF,
      shootStartsOn: "2027-03-01",
      shootEndsOn: "2027-03-03",
      rateMin: 150000,
      rateMax: 250000,
      rateCurrency: "NGN",
    })
    expect(seen.briefAttachedAt).not.toBeNull()
    // The same match leads to the thread both sides open.
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.matchId, m.matchId))
    expect(seen.conversationId).toBe(conversation!.id)
    // The booker sees exactly what the talent sees.
    expect((await m.booker.api.match.get({ matchId: m.matchId })).brief).toEqual(seen.brief)
  })

  it("shows what was attached, not the role as it is now, until the booker attaches again", async () => {
    const m = await matched("snapshot")
    await m.booker.api.match.attachBrief({ matchId: m.matchId })
    await db
      .update(schema.roles)
      .set({ brief: "Changed: now a supporting part.", rateMin: "300000", rateMax: "400000" })
      .where(eq(schema.roles.id, m.roleId))

    const stale = await m.talent.api.match.get({ matchId: m.matchId })
    expect(stale.brief).toMatchObject({ brief: BRIEF, rateMin: 150000, rateMax: 250000 })

    await m.booker.api.match.attachBrief({ matchId: m.matchId })
    expect((await m.talent.api.match.get({ matchId: m.matchId })).brief).toMatchObject({
      brief: "Changed: now a supporting part.",
      rateMin: 300000,
      rateMax: 400000,
    })
  })

  it("never carries the role's requirements, which can hold sensitive attributes", async () => {
    const m = await matched("requirements")
    await m.booker.api.match.attachBrief({ matchId: m.matchId })

    const seen = await m.talent.api.match.get({ matchId: m.matchId })
    expect(JSON.stringify(seen)).not.toMatch(/complexion|requirements|anyOf/i)
    const [stored] = await db.select().from(schema.matches).where(eq(schema.matches.id, m.matchId))
    expect(JSON.stringify(stored!.brief)).not.toMatch(/complexion|requirements|anyOf/i)
  })

  it("needs a role when the interest named none, and only the booker's own role with a brief", async () => {
    const w = await world()
    const talentId = await liveTalent(w, "pick-talent")
    await db.insert(schema.userModes).values({ userId: talentId, mode: "talent" }).onConflictDoNothing()
    const talent = caller(talentId)
    const b = await booker(w, "pick-booker")
    const { sessionId } = await b.api.deck.start({ filters: w.filters })
    const page = await b.api.deck.next({ sessionId, limit: 20 })
    await b.api.deck.swipe({ sessionId, position: page.cards[0]!.position, direction: "interest" })
    const [interest] = await db.select().from(schema.interests).where(eq(schema.interests.talentId, talentId))
    const { matchId } = await talent.interest.accept({ interestId: interest!.id })

    await expect(b.api.match.attachBrief({ matchId })).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const own = await role(b.userId, { categoryId: w.categoryId, brief: BRIEF })
    await expect(b.api.match.attachBrief({ matchId, roleId: own })).resolves.toMatchObject({
      brief: { roleId: own, brief: BRIEF },
    })

    const noBrief = await role(b.userId, { categoryId: w.categoryId })
    await expect(b.api.match.attachBrief({ matchId, roleId: noBrief })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    })

    const other = await booker(w, "pick-other")
    const theirs = await role(other.userId, { categoryId: w.categoryId, brief: BRIEF })
    await expect(b.api.match.attachBrief({ matchId, roleId: theirs })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(b.api.match.attachBrief({ matchId, roleId: randomUUID() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("is the booker's to do: not the talent, another booker, or a stranger", async () => {
    const m = await matched("authz")
    await expect(m.talent.api.match.attachBrief({ matchId: m.matchId })).rejects.toMatchObject({ code: "FORBIDDEN" })

    const otherBooker = await booker(m.w, "authz-other")
    await expect(otherBooker.api.match.attachBrief({ matchId: m.matchId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })

    const strangerId = await newUser("authz-stranger")
    for (const matchId of [m.matchId, randomUUID()]) {
      await expect(caller(strangerId).match.get({ matchId })).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(otherBooker.api.match.get({ matchId })).rejects.toMatchObject({ code: "NOT_FOUND" })
    }
    expect((await m.talent.api.match.get({ matchId: m.matchId })).brief).toBeNull()
  })

  it("keeps the brief and its timestamp together in the database", async () => {
    const m = await matched("together")
    const code = async (work: Promise<unknown>) => {
      try {
        await work
      } catch (error) {
        return (error as { cause?: { code?: string } }).cause?.code
      }
    }
    expect(
      await code(db.update(schema.matches).set({ briefAttachedAt: new Date() }).where(eq(schema.matches.id, m.matchId))),
    ).toBe("23514")
  })
})
