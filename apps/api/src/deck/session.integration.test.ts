import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { asc, eq, inArray } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { createContext } from "../trpc/context.js"
import { appRouter } from "../trpc/router.js"
import { startDeck } from "./session.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []
const createdCityIds: string[] = []

const tag = () => randomUUID().slice(0, 8)

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

/** A booker with a finished profile. */
async function booker(label: string) {
  const userId = await newUser(label)
  const api = caller(userId)
  await api.auth.enableMode({ mode: "booker" })
  const [city] = await db
    .insert(schema.cities)
    .values({ slug: `deck-session-city-${tag()}`, name: "Lagos" })
    .returning({ id: schema.cities.id })
  createdCityIds.push(city!.id)
  await api.booker.updateProfile({
    vertical: "casting_director",
    companyName: null,
    cityId: city!.id,
    typicalProjectTypes: ["film"],
  })
  return { userId, api }
}

/**
 * `count` live talents with the same quality score, above anything else in the database, so the
 * first cards of a deck come from this pool and only the session seed orders them. Inserted
 * directly: the deck reads `talent_search`, which the profile trigger fills; the score column
 * is the search-scores job's, set here as a fixture.
 */
async function tiedPool(count: number) {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const userId = await newUser(`deck-pool-${i}`)
    await db.insert(schema.talentProfiles).values({
      userId,
      slug: `deck-pool-${tag()}`,
      displayName: `Pool Talent ${i}`,
      status: "live",
      publishedAt: new Date(),
    })
    ids.push(userId)
  }
  await db
    .update(schema.talentSearch)
    .set({ qualityScore: "100" })
    .where(inArray(schema.talentSearch.talentId, ids))
  return ids
}

async function queue(sessionId: string) {
  return db
    .select()
    .from(schema.deckQueue)
    .where(eq(schema.deckQueue.sessionId, sessionId))
    .orderBy(asc(schema.deckQueue.position))
}

describe("deck.start", () => {
  afterEach(async () => {
    for (const id of seededUserIds.splice(0)) await deleteAuthUser(id)
    for (const id of createdCityIds.splice(0)) {
      await db.delete(schema.cities).where(eq(schema.cities.id, id))
    }
  })

  it("materialises a ranked queue of live talents, excluding the booker's own profile", async () => {
    const pool = await tiedPool(3)
    const { userId, api } = await booker("deck-session-booker")
    // The booker is also a live talent; their own card must not be queued.
    await db.insert(schema.talentProfiles).values({
      userId,
      slug: `deck-self-${tag()}`,
      displayName: "Booker Who Acts",
      status: "live",
      publishedAt: new Date(),
    })

    const session = await api.deck.start({ goalCount: 50 })
    expect(session).toMatchObject({ roleId: null, goalCount: 50 })

    const rows = await queue(session.sessionId)
    expect(rows).toHaveLength(session.queued)
    expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i))
    expect(rows.slice(0, 3).map((r) => r.talentId).sort()).toEqual([...pool].sort())
    expect(rows.map((r) => r.talentId)).not.toContain(userId)
    expect(rows[0]).toMatchObject({
      score: "1.0000",
      reasons: [{ code: "quality", contribution: 1 }],
      servedAt: null,
    })

    const [stored] = await db
      .select()
      .from(schema.deckSessions)
      .where(eq(schema.deckSessions.id, session.sessionId))
    expect(stored).toMatchObject({ bookerId: userId, goalCount: 50, endedAt: null })
  })

  it("gives sessions with different seeds different first-10 decks, and replays a seed exactly", async () => {
    await tiedPool(15)
    const { userId } = await booker("deck-session-seeds")
    const firstTen = async (seed: number) => {
      const session = await startDeck(db, userId, { roleId: null, goalCount: null }, seed)
      return (await queue(session.sessionId)).slice(0, 10).map((r) => r.talentId)
    }

    const a = await firstTen(1)
    const b = await firstTen(2)
    expect(a).toHaveLength(10)
    expect(b).not.toEqual(a)
    expect(await firstTen(1)).toEqual(a)
  })

  it("records the booker's own role and rejects anyone else's", async () => {
    const owner = await booker("deck-session-owner")
    const [project] = await db
      .insert(schema.projects)
      .values({ bookerId: owner.userId, name: "Lagos Nights" })
      .returning({ id: schema.projects.id })
    const [role] = await db
      .insert(schema.roles)
      .values({ projectId: project!.id, name: "Lead" })
      .returning({ id: schema.roles.id })

    const session = await owner.api.deck.start({ roleId: role!.id })
    expect(session.roleId).toBe(role!.id)

    const other = await booker("deck-session-other")
    await expect(other.api.deck.start({ roleId: role!.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("needs a finished booker profile", async () => {
    const userId = await newUser("deck-session-no-profile")
    const api = caller(userId)
    await api.auth.enableMode({ mode: "booker" })
    await expect(api.deck.start()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })
})
