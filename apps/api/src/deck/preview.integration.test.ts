import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { eq, inArray } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { createContext } from "../trpc/context.js"
import { appRouter } from "../trpc/router.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []
const createdCityIds: string[] = []
const createdSkillIds: string[] = []
const createdCategoryIds: string[] = []
const createdAttributeKeys: string[] = []

const tag = () => randomUUID().slice(0, 8)

function caller(userId: string) {
  const request = new Request("http://api.test/trpc", {
    headers: { authorization: "Bearer test-token", "x-forwarded-for": "203.0.113.96" },
  })
  return appRouter.createCaller({ ...createContext(request), verifyAccessToken: async () => ({ userId }) })
}

async function newUser(label: string) {
  const userId = await seedAuthUser(label, adult)
  seededUserIds.push(userId)
  return userId
}

async function cityId() {
  const [city] = await db
    .insert(schema.cities)
    .values({ slug: `deck-city-${tag()}`, name: "Lagos" })
    .returning({ id: schema.cities.id })
  createdCityIds.push(city!.id)
  return city!.id
}

async function skillIds() {
  const ids: string[] = []
  for (const name of ["Lighting", "Editing", "Framing"]) {
    const [skill] = await db
      .insert(schema.skills)
      .values({ slug: `deck-skill-${tag()}`, name })
      .returning({ id: schema.skills.id })
    createdSkillIds.push(skill!.id)
    ids.push(skill!.id)
  }
  return ids
}

async function category(kind: "on_camera" | "crew", name: string) {
  const [row] = await db
    .insert(schema.categories)
    .values({ slug: `deck-cat-${tag()}`, name, kind })
    .returning({ id: schema.categories.id })
  createdCategoryIds.push(row!.id)
  return row!.id
}

/** A talent through the real studio path; published unless `draft`. */
async function talent(label: string, displayName: string, { draft = false } = {}) {
  const userId = await newUser(label)
  const api = caller(userId)
  await api.auth.enableMode({ mode: "talent" })
  const photos = await api.talent.studio.createPlaceholderPhotos({ count: 3 })
  await api.talent.studio.completeQuickStart({
    displayName,
    cityId: await cityId(),
    bio: "Bio.",
    skillIds: await skillIds(),
    photoMediaIds: photos.mediaIds,
  })
  if (!draft) await api.talent.studio.publish()
  return { userId, api }
}

describe("deck.preview", () => {
  afterEach(async () => {
    for (const id of seededUserIds.splice(0)) await deleteAuthUser(id)
    if (createdAttributeKeys.length > 0) {
      await db
        .delete(schema.attributeDefinitions)
        .where(inArray(schema.attributeDefinitions.key, createdAttributeKeys.splice(0)))
    }
    for (const id of createdCategoryIds.splice(0)) {
      await db.delete(schema.categories).where(eq(schema.categories.id, id))
    }
    for (const id of createdSkillIds.splice(0)) {
      await db.delete(schema.skills).where(eq(schema.skills.id, id))
    }
    for (const id of createdCityIds.splice(0)) {
      await db.delete(schema.cities).where(eq(schema.cities.id, id))
    }
  })

  it("serves live talents as cards with a decision layer, not drafts or the booker's own", async () => {
    const crew = await talent("deck-crew", "Bisi Cinematographer")
    const crewCategory = await category("crew", "Photographers & cinematographers")
    await db
      .insert(schema.talentCategories)
      .values({ talentId: crew.userId, categoryId: crewCategory, isPrimary: true })
    await db.insert(schema.credits).values([
      { talentId: crew.userId, title: "Lagos Nights", roleName: "DP", year: 2025, isSignature: true },
      { talentId: crew.userId, title: "Market Day", year: 2023 },
    ])
    await talent("deck-draft", "Draft Talent", { draft: true })

    // The booker is also a live talent; their own card must not appear.
    const booker = await talent("deck-booker", "Booker Who Acts")
    await booker.api.auth.enableMode({ mode: "booker" })

    const { cards } = await booker.api.deck.preview({ limit: 30 })
    const names = cards.map((c) => c.talent.profile.displayName)
    expect(names).toContain("Bisi Cinematographer")
    expect(names).not.toContain("Draft Talent")
    expect(names).not.toContain("Booker Who Acts")

    const card = cards.find((c) => c.talent.profile.userId === crew.userId)!
    expect(card.decision).toMatchObject({
      categoryName: "Photographers & cinematographers",
      categoryKind: "crew",
      ageRange: null,
      creditCount: 2,
      signatureCredit: { title: "Lagos Nights", roleName: "DP", year: 2025 },
    })
    expect(card.talent.profile).not.toHaveProperty("status")
    for (const id of card.decision.leadMediaIds) expect(card.media[id]?.status).toBe("ready")
  })

  it("gives on-camera cards their playing-age range", async () => {
    const actor = await talent("deck-actor", "Ada Actor")
    await db.insert(schema.talentCategories).values({
      talentId: actor.userId,
      categoryId: await category("on_camera", "Actors"),
      isPrimary: true,
    })
    const definitions = await db
      .insert(schema.attributeDefinitions)
      .values([
        { key: "playing_age_min", label: "From", dataType: "number", tier: "standard" },
        { key: "playing_age_max", label: "To", dataType: "number", tier: "standard" },
      ])
      .onConflictDoNothing({ target: schema.attributeDefinitions.key })
      .returning({ id: schema.attributeDefinitions.id, key: schema.attributeDefinitions.key })
    createdAttributeKeys.push(...definitions.map((d) => d.key))
    const ids = await db
      .select({ id: schema.attributeDefinitions.id, key: schema.attributeDefinitions.key })
      .from(schema.attributeDefinitions)
      .where(inArray(schema.attributeDefinitions.key, ["playing_age_min", "playing_age_max"]))
    await db.insert(schema.talentAttributes).values(
      ids.map((d) => ({
        talentId: actor.userId,
        definitionId: d.id,
        valueNum: d.key === "playing_age_min" ? "25" : "32",
      }))
    )

    const bookerId = await newUser("deck-booker-2")
    const api = caller(bookerId)
    await api.auth.enableMode({ mode: "booker" })
    const { cards } = await api.deck.preview()
    const card = cards.find((c) => c.talent.profile.userId === actor.userId)
    expect(card?.decision).toMatchObject({ categoryKind: "on_camera", ageRange: { min: 25, max: 32 } })
  })

  it("is booker-only", async () => {
    const userId = await newUser("deck-talent-only")
    const api = caller(userId)
    await api.auth.enableMode({ mode: "talent" })
    await expect(api.deck.preview()).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})
