import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { and, asc, eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { createContext } from "../trpc/context.js"
import { appRouter } from "../trpc/router.js"
import { clearExposureThresholdCache } from "./exposure.js"
import { clearRankingWeightsCache } from "./ranking-weights.js"
import { startDeck } from "./session.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []
const createdCityIds: string[] = []
const createdCategoryIds: string[] = []
const createdLanguageIds: string[] = []
const createdWeightKeys: string[] = []

const tag = () => randomUUID().slice(0, 8)
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

function caller(userId: string) {
  const request = new Request("http://api.test/trpc", {
    headers: { authorization: "Bearer test-token", "x-forwarded-for": "203.0.113.97" },
  })
  return appRouter.createCaller({ ...createContext(request), verifyAccessToken: async () => ({ userId }) })
}

async function newUser(label: string) {
  const userId = await seedAuthUser(label, adult)
  seededUserIds.push(userId)
  return userId
}

async function city(country = "NG") {
  const [row] = await db
    .insert(schema.cities)
    .values({ slug: `deck-session-city-${tag()}`, name: "Lagos", country })
    .returning({ id: schema.cities.id })
  createdCityIds.push(row!.id)
  return row!.id
}

async function category() {
  const [row] = await db
    .insert(schema.categories)
    .values({ slug: `deck-session-cat-${tag()}`, name: "Actors", kind: "on_camera" })
    .returning({ id: schema.categories.id })
  createdCategoryIds.push(row!.id)
  return row!.id
}

/**
 * A Nigerian city and a category of the test's own. Decks filter on that category, so only
 * talents this test made can appear, whatever else the database holds.
 */
async function world() {
  const cityId = await city()
  const categoryId = await category()
  return { cityId, categoryId, filters: { categoryIds: [categoryId] } }
}

type World = Awaited<ReturnType<typeof world>>

/** A booker with a finished profile in the world's city. */
async function booker(w: World, label: string, vertical: "casting_director" | "other" = "casting_director") {
  const userId = await newUser(label)
  const api = caller(userId)
  await api.auth.enableMode({ mode: "booker" })
  await api.booker.updateProfile({
    vertical,
    companyName: null,
    cityId: w.cityId,
    typicalProjectTypes: ["film"],
  })
  return { userId, api }
}

/**
 * A live talent, inserted directly: the deck reads `talent_search`, which the profile and
 * category triggers fill. Quality is the search-scores job's column, set here as a fixture —
 * the same score for every talent, so only the session seed orders them.
 */
async function liveTalent(
  w: World,
  label: string,
  { cityId = w.cityId, categoryId = w.categoryId }: { cityId?: string; categoryId?: string } = {},
) {
  const userId = await newUser(label)
  await db.insert(schema.talentProfiles).values({
    userId,
    slug: `deck-${label}-${tag()}`,
    displayName: label,
    cityId,
    status: "live",
    publishedAt: new Date(),
  })
  await db.insert(schema.talentCategories).values({ talentId: userId, categoryId, isPrimary: true })
  await db
    .update(schema.talentSearch)
    .set({ qualityScore: "100" })
    .where(eq(schema.talentSearch.talentId, userId))
  return userId
}

async function role(bookerId: string, fields: { categoryId?: string; brief?: string } = {}) {
  const [project] = await db
    .insert(schema.projects)
    .values({ bookerId, name: "Lagos Nights" })
    .returning({ id: schema.projects.id })
  const [row] = await db
    .insert(schema.roles)
    .values({ projectId: project!.id, name: "Lead", ...fields })
    .returning({ id: schema.roles.id })
  return row!.id
}

async function queue(sessionId: string) {
  return db
    .select()
    .from(schema.deckQueue)
    .where(eq(schema.deckQueue.sessionId, sessionId))
    .orderBy(asc(schema.deckQueue.position))
}

async function queuedIds(sessionId: string) {
  return (await queue(sessionId)).map((row) => row.talentId)
}

describe("deck.start", () => {
  afterEach(async () => {
    for (const id of seededUserIds.splice(0)) await deleteAuthUser(id)
    for (const id of createdLanguageIds.splice(0)) {
      await db.delete(schema.languages).where(eq(schema.languages.id, id))
    }
    for (const key of createdWeightKeys.splice(0)) {
      await db.delete(schema.rankingWeights).where(eq(schema.rankingWeights.key, key))
    }
    clearRankingWeightsCache()
    clearExposureThresholdCache()
    for (const id of createdCategoryIds.splice(0)) {
      await db.delete(schema.categories).where(eq(schema.categories.id, id))
    }
    for (const id of createdCityIds.splice(0)) {
      await db.delete(schema.cities).where(eq(schema.cities.id, id))
    }
  })

  it("materialises a ranked queue and keeps the session's filters", async () => {
    const w = await world()
    const pool = [await liveTalent(w, "pool-a"), await liveTalent(w, "pool-b")]
    const { userId, api } = await booker(w, "deck-session-booker")
    // The booker is also a live talent in the same category; their own card must not be queued.
    await db.insert(schema.talentProfiles).values({
      userId,
      slug: `deck-self-${tag()}`,
      displayName: "Booker Who Acts",
      cityId: w.cityId,
      status: "live",
      publishedAt: new Date(),
    })
    await db.insert(schema.talentCategories).values({ talentId: userId, categoryId: w.categoryId })

    const session = await api.deck.start({ goalCount: 50, filters: w.filters })
    expect(session).toMatchObject({ roleId: null, goalCount: 50, queued: 2 })

    const rows = await queue(session.sessionId)
    expect(rows.map((r) => r.position)).toEqual([0, 1])
    expect(rows.map((r) => r.talentId).sort()).toEqual([...pool].sort())
    // Same city as the booker and full quality; the test category has no vertical weight and
    // the fixture has no freshness or responsiveness. Default weights: geo 0.6, quality 0.8.
    expect(rows[0]).toMatchObject({
      score: "1.4000",
      reasons: [
        { code: "geo", contribution: 0.6, detail: { level: "city" } },
        { code: "quality", contribution: 0.8 },
      ],
      servedAt: null,
    })

    const [stored] = await db
      .select()
      .from(schema.deckSessions)
      .where(eq(schema.deckSessions.id, session.sessionId))
    expect(stored).toMatchObject({ bookerId: userId, goalCount: 50, filters: w.filters, endedAt: null })
  })

  it("gives sessions with different seeds different first-10 decks, and replays a seed exactly", async () => {
    const w = await world()
    for (let i = 0; i < 15; i++) await liveTalent(w, `pool-${i}`)
    const { userId } = await booker(w, "deck-session-seeds")
    const firstTen = async (seed: number) => {
      const input = { roleId: null, goalCount: null, filters: w.filters }
      const session = await startDeck(db, userId, input, seed)
      return (await queuedIds(session.sessionId)).slice(0, 10)
    }

    const a = await firstTen(1)
    const b = await firstTen(2)
    expect(a).toHaveLength(10)
    expect(b).not.toEqual(a)
    expect(await firstTen(1)).toEqual(a)
  })

  it("keeps out drafts, other categories, and talents outside the booker's country", async () => {
    const w = await world()
    const inScope = await liveTalent(w, "in-scope")
    const otherCategory = await liveTalent(w, "other-category", { categoryId: await category() })
    const abroad = await liveTalent(w, "abroad", { cityId: await city("GH") })
    const draft = await liveTalent(w, "draft")
    await db
      .update(schema.talentProfiles)
      .set({ status: "draft", publishedAt: null })
      .where(eq(schema.talentProfiles.userId, draft))

    const { api } = await booker(w, "deck-session-scope")
    const ids = await queuedIds((await api.deck.start({ filters: w.filters })).sessionId)
    expect(ids).toEqual([inScope])
    expect(ids).not.toContain(otherCategory)
    expect(ids).not.toContain(abroad)
  })

  it("falls back to the vertical's preferred categories when nothing names one", async () => {
    const w = await world()
    const preferred = await liveTalent(w, "preferred")
    const unpreferred = await liveTalent(w, "unpreferred", { categoryId: await category() })
    const { api } = await booker(w, "deck-session-vertical", "other")
    await db
      .insert(schema.verticalCategoryWeights)
      .values({ bookerVertical: "other", categoryId: w.categoryId, weight: "0.800" })

    const ids = await queuedIds((await api.deck.start()).sessionId)
    expect(ids).toContain(preferred)
    expect(ids).not.toContain(unpreferred)
  })

  it("hides a talent swiped for a role for 30 days, for that role only", async () => {
    const w = await world()
    const passed = await liveTalent(w, "passed")
    const other = await liveTalent(w, "other")
    const { userId, api } = await booker(w, "deck-session-decay")
    const roleA = await role(userId, { categoryId: w.categoryId })
    const roleB = await role(userId, { categoryId: w.categoryId })
    await db
      .insert(schema.swipes)
      .values({ bookerId: userId, talentId: passed, roleId: roleA, direction: "pass" })

    const forRole = async (roleId: string) =>
      queuedIds((await api.deck.start({ roleId })).sessionId)

    expect(await forRole(roleA)).toEqual([other])
    expect((await forRole(roleB)).sort()).toEqual([passed, other].sort())

    // An undone swipe, or one older than the window, no longer hides the talent.
    await db.update(schema.swipes).set({ undoneAt: new Date() }).where(eq(schema.swipes.talentId, passed))
    expect(await forRole(roleA)).toContain(passed)
    await db
      .update(schema.swipes)
      .set({ undoneAt: null, createdAt: daysAgo(31) })
      .where(eq(schema.swipes.talentId, passed))
    expect(await forRole(roleA)).toContain(passed)
  })

  it("keeps out talents blocked in either direction", async () => {
    const w = await world()
    const blockedByBooker = await liveTalent(w, "blocked-by-booker")
    const blockedBooker = await liveTalent(w, "blocked-booker")
    const visible = await liveTalent(w, "visible")
    const { userId, api } = await booker(w, "deck-session-blocks")
    await db.insert(schema.blocks).values([
      { blockerId: userId, blockedId: blockedByBooker },
      { blockerId: blockedBooker, blockedId: userId },
    ])

    expect(await queuedIds((await api.deck.start({ filters: w.filters })).sessionId)).toEqual([visible])
  })

  it("applies standard filters, never dropping a hidden rate", async () => {
    const w = await world()
    const cheap = await liveTalent(w, "cheap")
    const pricey = await liveTalent(w, "pricey")
    const hidden = await liveTalent(w, "hidden-rate")
    const rates = { [cheap]: "50000", [pricey]: "200000", [hidden]: null }
    for (const [talentId, rateDayMin] of Object.entries(rates)) {
      await db
        .update(schema.talentSearch)
        .set({ rateDayMin, rateVisibility: rateDayMin ? "public" : "hidden", creditCount: 2 })
        .where(eq(schema.talentSearch.talentId, talentId))
    }
    const { api } = await booker(w, "deck-session-filters")

    const affordable = await queuedIds(
      (await api.deck.start({ filters: { ...w.filters, rateDayMax: 100000 } })).sessionId,
    )
    expect(affordable.sort()).toEqual([cheap, hidden].sort())

    const experienced = await queuedIds(
      (await api.deck.start({ filters: { ...w.filters, minCredits: 3 } })).sessionId,
    )
    expect(experienced).toEqual([])
  })

  it("rejects sensitive filters without a briefed role, and never excludes on them", async () => {
    const w = await world()
    const talent = await liveTalent(w, "sensitive-pool")
    const { userId, api } = await booker(w, "deck-session-sensitive")
    const complexion = { attributes: { complexion: { anyOf: ["dark"] } } }

    await expect(
      api.deck.start({ filters: { ...w.filters, ...complexion } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("brief") })
    const unbriefed = await role(userId, { categoryId: w.categoryId })
    await expect(api.deck.start({ roleId: unbriefed, filters: complexion })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })

    // With a brief it is accepted as a preference for scoring: the talent (no complexion on
    // record) is still queued.
    const briefed = await role(userId, { categoryId: w.categoryId, brief: "Lead in a Lagos drama" })
    const session = await api.deck.start({ roleId: briefed, filters: complexion })
    expect(await queuedIds(session.sessionId)).toEqual([talent])
  })

  it("rejects unknown attributes and standard attributes it can't filter on yet", async () => {
    const w = await world()
    const { api } = await booker(w, "deck-session-attributes")
    await expect(
      api.deck.start({ filters: { attributes: { shoe_colour: { anyOf: ["red"] } } } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Unknown") })
    await expect(
      api.deck.start({ filters: { attributes: { height_cm: { min: 160 } } } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("yet") })
  })

  it("records the booker's own role and rejects anyone else's", async () => {
    const w = await world()
    const owner = await booker(w, "deck-session-owner")
    const roleId = await role(owner.userId)

    const session = await owner.api.deck.start({ roleId })
    expect(session.roleId).toBe(roleId)

    const other = await booker(w, "deck-session-other")
    await expect(other.api.deck.start({ roleId })).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("ranks a role's language match first without dropping the talent who misses it", async () => {
    const w = await world()
    const [yoruba] = await db
      .insert(schema.languages)
      .values({ slug: `yoruba-${tag()}`, name: "Yoruba" })
      .returning({ id: schema.languages.id, slug: schema.languages.slug })
    createdLanguageIds.push(yoruba!.id)
    const misses = await liveTalent(w, "misses-language")
    const speaker = await liveTalent(w, "speaks-yoruba")
    await db.insert(schema.talentLanguages).values({ talentId: speaker, languageId: yoruba!.id })
    const { userId, api } = await booker(w, "deck-session-role-match")
    const [project] = await db
      .insert(schema.projects)
      .values({ bookerId: userId, name: "Lagos Nights" })
      .returning({ id: schema.projects.id })
    const [roleRow] = await db
      .insert(schema.roles)
      .values({
        projectId: project!.id,
        name: "Lead",
        categoryId: w.categoryId,
        requirements: { languages: { anyOf: [yoruba!.slug] } },
      })
      .returning({ id: schema.roles.id })

    const rows = await queue((await api.deck.start({ roleId: roleRow!.id })).sessionId)
    expect(rows.map((r) => r.talentId)).toEqual([speaker, misses])
    expect(rows[0]!.reasons).toContainEqual({
      code: "role",
      contribution: 1,
      detail: { matched: ["languages"] },
    })
    // No languages on record is unknown, not a miss: half the role weight, and nothing named
    // as matched, so the card's reason string (5.11) won't claim a role match.
    expect(rows[1]!.reasons).toContainEqual({ code: "role", contribution: 0.5 })
  })

  it("reads term weights from ranking_weights", async () => {
    const w = await world()
    await liveTalent(w, "weighted")
    const { api } = await booker(w, "deck-session-weights")
    await db.insert(schema.rankingWeights).values({ key: "w_quality", value: "0" })
    createdWeightKeys.push("w_quality")
    clearRankingWeightsCache()
    clearExposureThresholdCache()

    const [row] = await queue((await api.deck.start({ filters: w.filters })).sessionId)
    expect(row!.score).toBe("0.6000")
    expect(row!.reasons.map((r) => r.code)).toEqual(["geo"])
  })

  it("demotes a talent seen too often this week, without dropping them", async () => {
    const w = await world()
    const busy = await liveTalent(w, "busy")
    const quiet = await liveTalent(w, "quiet")
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(schema.talentExposureDaily).values({ talentId: busy, day: today, impressions: 500 })
    const { api } = await booker(w, "deck-session-exposure")

    const rows = await queue((await api.deck.start({ filters: w.filters })).sessionId)
    expect(rows.map((r) => r.talentId)).toEqual([quiet, busy])
    const penalty = rows[1]!.reasons.find((r) => r.code === "exposure")
    expect(penalty?.contribution).toBeLessThan(0)
    // The reasons still add up to the stored score.
    const sum = rows[1]!.reasons.reduce((total, r) => total + r.contribution, 0)
    expect(sum).toBeCloseTo(Number(rows[1]!.score), 4)
  })

  it("needs a finished booker profile", async () => {
    const userId = await newUser("deck-session-no-profile")
    const api = caller(userId)
    await api.auth.enableMode({ mode: "booker" })
    await expect(api.deck.start()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })
})

describe("deck.next", () => {
  afterEach(async () => {
    for (const id of seededUserIds.splice(0)) await deleteAuthUser(id)
    for (const id of createdCategoryIds.splice(0)) {
      await db.delete(schema.categories).where(eq(schema.categories.id, id))
    }
    for (const id of createdCityIds.splice(0)) {
      await db.delete(schema.cities).where(eq(schema.cities.id, id))
    }
    clearRankingWeightsCache()
    clearExposureThresholdCache()
  })

  it("serves the queue in order, page by page, recording an impression for each card", async () => {
    const w = await world()
    for (let i = 0; i < 5; i++) await liveTalent(w, `paged-${i}`)
    const { api } = await booker(w, "deck-next-paging")
    const { sessionId } = await api.deck.start({ filters: w.filters })
    const queued = await queuedIds(sessionId)

    const first = await api.deck.next({ sessionId, limit: 3 })
    const second = await api.deck.next({ sessionId, limit: 3 })
    expect(first.cards.map((c) => c.position)).toEqual([0, 1, 2])
    expect(second.cards.map((c) => c.position)).toEqual([3, 4])
    expect([...first.cards, ...second.cards].map((c) => c.talent.profile.userId)).toEqual(queued)
    expect(first.exhausted).toBe(false)
    expect(second.exhausted).toBe(true)
    expect(first.cards[0]!.reasons.map((r) => r.code)).toContain("quality")

    const rows = await queue(sessionId)
    expect(rows.every((r) => r.servedAt !== null)).toBe(true)
    const impressions = await db
      .select()
      .from(schema.deckImpressions)
      .where(eq(schema.deckImpressions.sessionId, sessionId))
    expect(impressions.map((r) => r.position).sort()).toEqual([0, 1, 2, 3, 4])
    const [exposure] = await db
      .select()
      .from(schema.talentExposureDaily)
      .where(eq(schema.talentExposureDaily.talentId, queued[0]!))
    expect(exposure!.impressions).toBe(1)
  })

  it("keeps paging the materialised order when scores change mid-session", async () => {
    const w = await world()
    for (let i = 0; i < 6; i++) await liveTalent(w, `stable-${i}`)
    const { api } = await booker(w, "deck-next-stable")
    const { sessionId } = await api.deck.start({ filters: w.filters })
    const queued = await queuedIds(sessionId)

    await api.deck.next({ sessionId, limit: 2 })
    // The last-queued talent jumps to the top of any new ranking; this session must not notice.
    await db
      .update(schema.talentSearch)
      .set({ qualityScore: "0" })
      .where(eq(schema.talentSearch.talentId, queued[2]!))
    const page = await api.deck.next({ sessionId, limit: 4 })
    expect(page.cards.map((c) => c.talent.profile.userId)).toEqual(queued.slice(2))
  })

  it("refills from talent published after the session started, never repeating a card", async () => {
    const w = await world()
    const early = await liveTalent(w, "early")
    const { api } = await booker(w, "deck-next-refill")
    const { sessionId } = await api.deck.start({ filters: w.filters })
    const late = await liveTalent(w, "late")

    const page = await api.deck.next({ sessionId, limit: 5 })
    expect(page.cards.map((c) => c.talent.profile.userId)).toEqual([early, late])
    expect((await queue(sessionId)).map((r) => r.position)).toEqual([0, 1])
    expect(await api.deck.next({ sessionId })).toMatchObject({ cards: [], exhausted: true })
  })

  it("on an over-filtered deck, suggests the filters to drop, ranked by what each unlocks", async () => {
    const w = await world()
    const experienced = await liveTalent(w, "experienced")
    const reels = [await liveTalent(w, "reel-a"), await liveTalent(w, "reel-b")]
    await db
      .update(schema.talentSearch)
      .set({ creditCount: 6 })
      .where(eq(schema.talentSearch.talentId, experienced))
    for (const id of reels) {
      await db.update(schema.talentSearch).set({ hasShowreel: true }).where(eq(schema.talentSearch.talentId, id))
    }
    const { userId, api } = await booker(w, "deck-next-exhausted")
    const roleId = await role(userId, { categoryId: w.categoryId })

    const { sessionId, queued } = await api.deck.start({
      roleId,
      filters: { minCredits: 5, hasShowreel: true },
    })
    expect(queued).toBe(0)
    expect(await api.deck.next({ sessionId })).toEqual({
      cards: [],
      exhausted: true,
      suggestions: [
        { filter: "minCredits", unlocks: 2 },
        { filter: "hasShowreel", unlocks: 1 },
      ],
    })
  })

  it("skips a queued talent who went offline or blocked the booker mid-session", async () => {
    const w = await world()
    const unpublished = await liveTalent(w, "unpublished")
    const blocker = await liveTalent(w, "blocker")
    const kept = await liveTalent(w, "kept")
    const { userId, api } = await booker(w, "deck-next-skips")
    const { sessionId } = await api.deck.start({ filters: w.filters })

    await db
      .update(schema.talentProfiles)
      .set({ status: "draft", publishedAt: null })
      .where(eq(schema.talentProfiles.userId, unpublished))
    await db.insert(schema.blocks).values({ blockerId: blocker, blockedId: userId })

    const page = await api.deck.next({ sessionId })
    expect(page.cards.map((c) => c.talent.profile.userId)).toEqual([kept])
    expect(page.exhausted).toBe(true)
    const impressions = await db
      .select()
      .from(schema.deckImpressions)
      .where(and(eq(schema.deckImpressions.sessionId, sessionId)))
    expect(impressions.map((r) => r.talentId)).toEqual([kept])
  })

  it("serves only the booker's own session", async () => {
    const w = await world()
    const owner = await booker(w, "deck-next-owner")
    const { sessionId } = await owner.api.deck.start({ filters: w.filters })
    const other = await booker(w, "deck-next-intruder")
    await expect(other.api.deck.next({ sessionId })).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
