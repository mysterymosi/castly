import { schema } from "@workspace/db"
import { and, eq, inArray } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import {
  booker,
  cleanupDeckFixtures,
  createdLanguageIds,
  liveTalent,
  role,
  tag,
  world,
  type Caller,
} from "../test/deck-fixtures.js"
import { FREE_UNDO_LIMIT, SAVED_TALENT_NAME } from "./swipe.js"

/** Starts a session and serves its first page; returns the session and talent at each position. */
async function served(api: Caller, input: Parameters<Caller["deck"]["start"]>[0]) {
  const { sessionId } = await api.deck.start(input)
  const page = await api.deck.next({ sessionId, limit: 20 })
  const at = (talentId: string) => page.cards.find((c) => c.talent.profile.userId === talentId)!.position
  return { sessionId, at }
}

async function entries(shortlistId: string) {
  return db
    .select({ talentId: schema.shortlistEntries.talentId })
    .from(schema.shortlistEntries)
    .where(eq(schema.shortlistEntries.shortlistId, shortlistId))
}

describe("deck.swipe", () => {
  afterEach(cleanupDeckFixtures)

  it("puts a right-swiped talent on the active role's shortlist", async () => {
    const w = await world()
    const tunde = await liveTalent(w, "tunde")
    const { userId, api } = await booker(w, "swipe-role")
    const roleId = await role(userId, { categoryId: w.categoryId })
    const { sessionId, at } = await served(api, { roleId, goalCount: 5 })

    const result = await api.deck.swipe({ sessionId, position: at(tunde), direction: "interest" })
    expect(result).toMatchObject({ goal: { target: 5, shortlisted: 1 }, undosLeft: FREE_UNDO_LIMIT })

    const { shortlist, entries: listed } = await api.shortlist.get({ shortlistId: result.shortlistId! })
    expect(shortlist).toMatchObject({ roleId, name: "Lead", projectName: "Lagos Nights", entryCount: 1 })
    expect(listed.map((e) => e.card.talent.profile.userId)).toEqual([tunde])
  })

  it("sends save for later to Saved talent, even with a role, and a role-less interest there too", async () => {
    const w = await world()
    const saved = await liveTalent(w, "saved")
    const liked = await liveTalent(w, "liked")
    const { userId, api } = await booker(w, "swipe-saved")
    const roleId = await role(userId, { categoryId: w.categoryId })

    const forRole = await served(api, { roleId })
    const save = await api.deck.swipe({ sessionId: forRole.sessionId, position: forRole.at(saved), direction: "save" })
    const general = await served(api, { filters: w.filters })
    const like = await api.deck.swipe({
      sessionId: general.sessionId,
      position: general.at(liked),
      direction: "interest",
    })

    expect(like.shortlistId).toBe(save.shortlistId)
    const { shortlists } = await api.shortlist.list()
    expect(shortlists[0]).toMatchObject({ name: SAVED_TALENT_NAME, roleId: null, entryCount: 2 })
    // Saving isn't shortlisting: the role's goal doesn't move.
    expect(save.goal.shortlisted).toBe(0)
  })

  it("records a pass without touching any shortlist, hiding the talent from that role's next deck", async () => {
    const w = await world()
    const passed = await liveTalent(w, "passed")
    const { userId, api } = await booker(w, "swipe-pass")
    const roleId = await role(userId, { categoryId: w.categoryId })
    const { sessionId, at } = await served(api, { roleId })

    expect(await api.deck.swipe({ sessionId, position: at(passed), direction: "pass" })).toMatchObject({
      shortlistId: null,
    })
    const again = await api.deck.start({ roleId })
    expect(again.queued).toBe(0)
  })

  it("rejects an unserved card and a second decision on the same card", async () => {
    const w = await world()
    for (let i = 0; i < 3; i++) await liveTalent(w, `pool-${i}`)
    const { api } = await booker(w, "swipe-guards")
    const { sessionId } = await api.deck.start({ filters: w.filters })
    await api.deck.next({ sessionId, limit: 1 })

    await expect(api.deck.swipe({ sessionId, position: 2, direction: "pass" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await api.deck.swipe({ sessionId, position: 0, direction: "pass" })
    await expect(api.deck.swipe({ sessionId, position: 0, direction: "interest" })).rejects.toMatchObject({
      code: "CONFLICT",
    })
  })

  it("counts interests into today's exposure", async () => {
    const w = await world()
    const talent = await liveTalent(w, "counted")
    const { api } = await booker(w, "swipe-exposure")
    const { sessionId, at } = await served(api, { filters: w.filters })
    await api.deck.swipe({ sessionId, position: at(talent), direction: "interest" })
    const [row] = await db
      .select()
      .from(schema.talentExposureDaily)
      .where(eq(schema.talentExposureDaily.talentId, talent))
    expect(row).toMatchObject({ impressions: 1, interests: 1 })
  })
})

describe("deck.undo", () => {
  afterEach(cleanupDeckFixtures)

  it("removes the shortlist row, steps back to the card, and frees it for a new decision", async () => {
    const w = await world()
    const tunde = await liveTalent(w, "tunde")
    const { userId, api } = await booker(w, "undo-role")
    const roleId = await role(userId, { categoryId: w.categoryId })
    const { sessionId, at } = await served(api, { roleId, goalCount: 3 })
    const { shortlistId } = await api.deck.swipe({ sessionId, position: at(tunde), direction: "interest" })

    const undone = await api.deck.undo({ sessionId })
    expect(undone).toEqual({
      position: at(tunde),
      talentId: tunde,
      goal: { target: 3, shortlisted: 0 },
      undosLeft: FREE_UNDO_LIMIT - 1,
    })
    expect(await entries(shortlistId!)).toEqual([])
    const [exposure] = await db
      .select()
      .from(schema.talentExposureDaily)
      .where(eq(schema.talentExposureDaily.talentId, tunde))
    expect(exposure!.interests).toBe(0)

    // The card is open again: this time it's a pass.
    await api.deck.swipe({ sessionId, position: at(tunde), direction: "pass" })
  })

  it("keeps an entry that another live swipe also put there", async () => {
    const w = await world()
    const tunde = await liveTalent(w, "tunde")
    const { userId, api } = await booker(w, "undo-shared")
    const first = await served(api, { filters: w.filters })
    const { shortlistId } = await api.deck.swipe({
      sessionId: first.sessionId,
      position: first.at(tunde),
      direction: "interest",
    })
    // A role's deck still shows Tunde (the first swipe hides him only without a role), and saving
    // there lands on the same Saved talent list.
    const second = await served(api, { roleId: await role(userId, { categoryId: w.categoryId }) })
    await api.deck.swipe({ sessionId: second.sessionId, position: second.at(tunde), direction: "save" })

    await api.deck.undo({ sessionId: second.sessionId })
    expect((await entries(shortlistId!)).map((e) => e.talentId)).toEqual([tunde])
  })

  it("allows a free booker three undos per session", async () => {
    const w = await world()
    for (let i = 0; i < 5; i++) await liveTalent(w, `limit-${i}`)
    const { api } = await booker(w, "undo-limit")
    const { sessionId } = await served(api, { filters: w.filters })

    await expect(api.deck.undo({ sessionId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    for (let i = 0; i < FREE_UNDO_LIMIT; i++) {
      await api.deck.swipe({ sessionId, position: 0, direction: "pass" })
      await api.deck.undo({ sessionId })
    }
    await api.deck.swipe({ sessionId, position: 0, direction: "pass" })
    await expect(api.deck.undo({ sessionId })).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})

describe("deck.setGoal", () => {
  afterEach(cleanupDeckFixtures)

  it("sets the target and reports progress from live interest swipes", async () => {
    const w = await world()
    const ids = [await liveTalent(w, "goal-a"), await liveTalent(w, "goal-b")]
    const { api } = await booker(w, "goal")
    const { sessionId, at } = await served(api, { filters: w.filters })

    expect(await api.deck.setGoal({ sessionId, goalCount: 2 })).toEqual({ target: 2, shortlisted: 0 })
    await api.deck.swipe({ sessionId, position: at(ids[0]!), direction: "interest" })
    const { goal } = await api.deck.swipe({ sessionId, position: at(ids[1]!), direction: "pass" })
    expect(goal).toEqual({ target: 2, shortlisted: 1 })
    expect(await api.deck.setGoal({ sessionId, goalCount: null })).toEqual({ target: null, shortlisted: 1 })
  })
})

describe("shortlist.compare", () => {
  afterEach(cleanupDeckFixtures)

  it("shows two shortlisted talents' height, languages and credits side by side", async () => {
    const w = await world()
    const ada = await liveTalent(w, "ada")
    const bisi = await liveTalent(w, "bisi")
    const outsider = await liveTalent(w, "outsider")
    const [height] = await db
      .select({ id: schema.attributeDefinitions.id })
      .from(schema.attributeDefinitions)
      .where(eq(schema.attributeDefinitions.key, "height_cm"))
    await db.insert(schema.talentAttributes).values([
      { talentId: ada, definitionId: height!.id, valueNum: "168" },
      { talentId: bisi, definitionId: height!.id, valueNum: "175" },
    ])
    const [yoruba] = await db
      .insert(schema.languages)
      .values({ slug: `yoruba-${tag()}`, name: "Yoruba" })
      .returning({ id: schema.languages.id })
    createdLanguageIds.push(yoruba!.id)
    await db.insert(schema.talentLanguages).values({ talentId: ada, languageId: yoruba!.id })
    await db.insert(schema.credits).values([
      { talentId: ada, title: "Lagos Nights", roleName: "Lead", year: 2025, isSignature: true },
      { talentId: bisi, title: "Market Day", year: 2024 },
      { talentId: bisi, title: "Run Lagos", year: 2023 },
    ])

    const { api } = await booker(w, "compare")
    const { sessionId, at } = await served(api, { filters: w.filters })
    const { shortlistId } = await api.deck.swipe({ sessionId, position: at(ada), direction: "interest" })
    await api.deck.swipe({ sessionId, position: at(bisi), direction: "interest" })

    const { talents } = await api.shortlist.compare({ shortlistId: shortlistId!, talentIds: [ada, bisi] })
    expect(talents.map((t) => t.talent.profile.userId)).toEqual([ada, bisi])
    const [adaCard, bisiCard] = talents
    expect(adaCard!.talent.content.attributes).toContainEqual({ label: expect.stringMatching(/height/i), value: expect.stringContaining("168") })
    expect(bisiCard!.talent.content.attributes).toContainEqual({ label: expect.stringMatching(/height/i), value: expect.stringContaining("175") })
    expect(adaCard!.talent.content.languages.map((l) => l.name)).toEqual(["Yoruba"])
    expect(adaCard!.decision).toMatchObject({ creditCount: 1, signatureCredit: { title: "Lagos Nights" } })
    expect(bisiCard!.decision.creditCount).toBe(2)

    await expect(
      api.shortlist.compare({ shortlistId: shortlistId!, talentIds: [ada, outsider] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("keeps each booker's shortlists to themselves", async () => {
    const w = await world()
    const talent = await liveTalent(w, "private")
    const owner = await booker(w, "shortlist-owner")
    const { sessionId, at } = await served(owner.api, { filters: w.filters })
    const { shortlistId } = await owner.api.deck.swipe({ sessionId, position: at(talent), direction: "save" })
    const other = await booker(w, "shortlist-intruder")
    await expect(other.api.shortlist.get({ shortlistId: shortlistId! })).rejects.toMatchObject({ code: "NOT_FOUND" })
    const swipes = await db
      .select()
      .from(schema.swipes)
      .where(and(eq(schema.swipes.bookerId, owner.userId), inArray(schema.swipes.talentId, [talent])))
    expect(swipes).toHaveLength(1)
  })
})

describe("shortlist edits", () => {
  afterEach(cleanupDeckFixtures)

  /** A Saved talent list holding the given talents, saved in order (so the last is newest). */
  async function savedList(slug: string, count: number) {
    const w = await world()
    const talents: string[] = []
    for (let i = 0; i < count; i++) talents.push(await liveTalent(w, `${slug}-${i}`))
    const caller = await booker(w, slug)
    const { sessionId, at } = await served(caller.api, { filters: w.filters })
    let shortlistId = ""
    for (const talent of talents) {
      const result = await caller.api.deck.swipe({ sessionId, position: at(talent), direction: "save" })
      shortlistId = result.shortlistId!
    }
    return { w, talents, shortlistId, sessionId, ...caller }
  }

  const order = (detail: { entries: { card: { talent: { profile: { userId: string } } } }[] }) =>
    detail.entries.map((e) => e.card.talent.profile.userId)

  it("removes a talent, and a later undo of that swipe leaves the list alone", async () => {
    const { talents, shortlistId, sessionId, api } = await savedList("remove", 2)
    const [first, second] = talents as [string, string]

    const detail = await api.shortlist.remove({ shortlistId, talentId: second })
    expect(order(detail)).toEqual([first])
    expect(detail.shortlist.entryCount).toBe(1)

    // The swipe that saved `second` is the session's last; undoing it is now a no-op on the list.
    await api.deck.undo({ sessionId })
    expect((await entries(shortlistId)).map((e) => e.talentId)).toEqual([first])

    await expect(api.shortlist.remove({ shortlistId, talentId: second })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("sets, trims and clears a private note", async () => {
    const { talents, shortlistId, api } = await savedList("note", 1)
    const talentId = talents[0]!

    const noted = await api.shortlist.setNote({ shortlistId, talentId, note: "  Great accent work, check availability  " })
    expect(noted.entries[0]!.note).toBe("Great accent work, check availability")
    const cleared = await api.shortlist.setNote({ shortlistId, talentId, note: "   " })
    expect(cleared.entries[0]!.note).toBeNull()
  })

  it("keeps the booker's order, with later saves below it", async () => {
    const { w, talents, shortlistId, api } = await savedList("reorder", 3)
    const [a, b, c] = talents as [string, string, string]
    expect(order(await api.shortlist.get({ shortlistId }))).toEqual([c, b, a])

    expect(order(await api.shortlist.reorder({ shortlistId, talentIds: [a, c, b] }))).toEqual([a, c, b])

    // A new save lands unranked, after the booker's order.
    const late = await liveTalent(w, "reorder-late")
    const { sessionId, at } = await served(api, { filters: w.filters })
    await api.deck.swipe({ sessionId, position: at(late), direction: "save" })
    expect(order(await api.shortlist.get({ shortlistId }))).toEqual([a, c, b, late])

    await expect(api.shortlist.reorder({ shortlistId, talentIds: [a, a] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    const stranger = await liveTalent(w, "reorder-stranger")
    await expect(api.shortlist.reorder({ shortlistId, talentIds: [a, stranger] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("won't let another booker edit the list", async () => {
    const { w, talents, shortlistId } = await savedList("edit-owner", 1)
    const other = await booker(w, "edit-intruder")
    const talentId = talents[0]!
    await expect(other.api.shortlist.remove({ shortlistId, talentId })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(other.api.shortlist.setNote({ shortlistId, talentId, note: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(other.api.shortlist.reorder({ shortlistId, talentIds: [talentId] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })
})
