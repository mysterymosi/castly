import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { launchAttributeDefinitions } from "@workspace/db/seed-attributes"
import { asc, eq, inArray } from "drizzle-orm"

import { db } from "../db.js"
import { clearExposureThresholdCache } from "../deck/exposure.js"
import { clearRankingWeightsCache } from "../deck/ranking-weights.js"
import { createContext } from "../trpc/context.js"
import { appRouter } from "../trpc/router.js"
import { deleteAuthUser, seedAuthUser } from "./seed-auth-user.js"

/**
 * Deck fixtures for integration tests: a "world" (a Nigerian city and a category of the test's
 * own, so decks filtered on it see only the test's talents), bookers, live talents and roles.
 * Call `cleanupDeckFixtures` in `afterEach`.
 */
const adult = "1990-01-01"
export const seededUserIds: string[] = []
export const createdCityIds: string[] = []
export const createdCategoryIds: string[] = []
export const createdLanguageIds: string[] = []
export const createdWeightKeys: string[] = []
export const createdAttributeKeys: string[] = []

export const tag = () => randomUUID().slice(0, 8)
export const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

export type Caller = ReturnType<typeof appRouter.createCaller>

export function caller(userId: string): Caller {
  const request = new Request("http://api.test/trpc", {
    headers: { authorization: "Bearer test-token", "x-forwarded-for": "203.0.113.97" },
  })
  return appRouter.createCaller({ ...createContext(request), verifyAccessToken: async () => ({ userId }) })
}

export async function newUser(label: string) {
  const userId = await seedAuthUser(label, adult)
  seededUserIds.push(userId)
  return userId
}

export async function city(country = "NG") {
  const [row] = await db
    .insert(schema.cities)
    .values({ slug: `deck-session-city-${tag()}`, name: "Lagos", country })
    .returning({ id: schema.cities.id })
  createdCityIds.push(row!.id)
  return row!.id
}

export async function category() {
  const [row] = await db
    .insert(schema.categories)
    .values({ slug: `deck-session-cat-${tag()}`, name: "Actors", kind: "on_camera" })
    .returning({ id: schema.categories.id })
  createdCategoryIds.push(row!.id)
  return row!.id
}

/**
 * The launch attribute definitions (height, languages, complexion…) come from `db:seed`, which CI
 * does not run: insert any that are missing, exactly as the seed defines them, and remove only
 * those this test created. Stage 1 reads them to tier a filter or a role requirement.
 */
async function ensureAttributeDefinitions() {
  const inserted = await db
    .insert(schema.attributeDefinitions)
    .values(launchAttributeDefinitions.map(({ appliesTo: _appliesTo, ...definition }) => definition))
    .onConflictDoNothing({ target: schema.attributeDefinitions.key })
    .returning({ key: schema.attributeDefinitions.key })
  createdAttributeKeys.push(...inserted.map((row) => row.key))
}

/**
 * A Nigerian city and a category of the test's own. Decks filter on that category, so only
 * talents this test made can appear, whatever else the database holds.
 */
export async function world() {
  await ensureAttributeDefinitions()
  const cityId = await city()
  const categoryId = await category()
  return { cityId, categoryId, filters: { categoryIds: [categoryId] } }
}

export type World = Awaited<ReturnType<typeof world>>

/** A booker with a finished profile in the world's city. */
export async function booker(
  w: World,
  label: string,
  vertical: "casting_director" | "other" = "casting_director",
): Promise<{ userId: string; api: Caller }> {
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
export async function liveTalent(
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

export async function role(bookerId: string, fields: { categoryId?: string; brief?: string } = {}) {
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

export async function queue(sessionId: string) {
  return db
    .select()
    .from(schema.deckQueue)
    .where(eq(schema.deckQueue.sessionId, sessionId))
    .orderBy(asc(schema.deckQueue.position))
}

export async function queuedIds(sessionId: string) {
  return (await queue(sessionId)).map((row) => row.talentId)
}

/** Removes everything the fixtures created, and drops the deck's caches. */
export async function cleanupDeckFixtures() {
  for (const id of seededUserIds.splice(0)) await deleteAuthUser(id)
  for (const id of createdLanguageIds.splice(0)) {
    await db.delete(schema.languages).where(eq(schema.languages.id, id))
  }
  const attributeKeys = createdAttributeKeys.splice(0)
  if (attributeKeys.length > 0) {
    await db.delete(schema.attributeDefinitions).where(inArray(schema.attributeDefinitions.key, attributeKeys))
  }
  for (const key of createdWeightKeys.splice(0)) {
    await db.delete(schema.rankingWeights).where(eq(schema.rankingWeights.key, key))
  }
  for (const id of createdCategoryIds.splice(0)) {
    await db.delete(schema.categories).where(eq(schema.categories.id, id))
  }
  for (const id of createdCityIds.splice(0)) {
    await db.delete(schema.cities).where(eq(schema.cities.id, id))
  }
  clearRankingWeightsCache()
  clearExposureThresholdCache()
}
