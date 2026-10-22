import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import type { AuthClient } from "../auth/supabase.js"
import { db } from "../db.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { appRouter } from "../trpc/router.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []
const createdCityIds: string[] = []
const createdSkillIds: string[] = []

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
    ip: "203.0.113.91",
    requestId: "publish-integration",
    authorization: "Bearer test-token",
    auth: stubAuth,
    verifyAccessToken: async () => ({ userId }),
  })
}

async function ensureCityId() {
  const [existing] = await db
    .select({ id: schema.cities.id })
    .from(schema.cities)
    .limit(1)
  if (existing) return existing.id
  const slug = `publish-city-${randomUUID().slice(0, 8)}`
  const [created] = await db
    .insert(schema.cities)
    .values({ slug, name: "Publish City" })
    .returning({ id: schema.cities.id })
  if (!created) throw new Error("city insert failed")
  createdCityIds.push(created.id)
  return created.id
}

async function ensureSkillIds() {
  const rows = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .limit(3)
  if (rows.length >= 3) return rows.map((row) => row.id)
  const ids = rows.map((row) => row.id)
  while (ids.length < 3) {
    const slug = `publish-skill-${randomUUID().slice(0, 8)}`
    const [created] = await db
      .insert(schema.skills)
      .values({ slug, name: slug })
      .returning({ id: schema.skills.id })
    if (!created) throw new Error("skill insert failed")
    createdSkillIds.push(created.id)
    ids.push(created.id)
  }
  return ids
}

async function ensureEthnicity() {
  const [existing] = await db
    .select({ id: schema.attributeDefinitions.id })
    .from(schema.attributeDefinitions)
    .where(eq(schema.attributeDefinitions.key, "ethnicity"))
    .limit(1)
  if (existing) return
  await db.insert(schema.attributeDefinitions).values({
    key: "ethnicity",
    label: "Ethnicity",
    dataType: "select",
    tier: "sensitive",
    options: ["black"],
  })
}

async function quickStart(userId: string) {
  const api = talentCaller(userId)
  const photos = await api.talent.studio.createPlaceholderPhotos({ count: 3 })
  const cityId = await ensureCityId()
  const skillIds = await ensureSkillIds()
  return api.talent.studio.completeQuickStart({
    displayName: "Tunde Adeyemi",
    cityId,
    bio: "Actor based in Lagos.",
    skillIds,
    photoMediaIds: photos.mediaIds,
  })
}

describe("talent publish", () => {
  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
    while (createdSkillIds.length > 0) {
      const id = createdSkillIds.pop()
      if (id) await db.delete(schema.skills).where(eq(schema.skills.id, id))
    }
    while (createdCityIds.length > 0) {
      const id = createdCityIds.pop()
      if (id) await db.delete(schema.cities).where(eq(schema.cities.id, id))
    }
  })

  it("rejects publish until quick start is met", async () => {
    const userId = await seedAuthUser("publish-early", adult)
    seededUserIds.push(userId)
    const api = talentCaller(userId)
    await api.auth.enableMode({ mode: "talent" })
    await expect(api.talent.studio.publish()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    })
  })

  it("publishes live, writes quality without sensitive inputs, and unpublishes to draft", async () => {
    const userId = await seedAuthUser("publish-live", adult)
    seededUserIds.push(userId)
    const api = talentCaller(userId)
    await api.auth.enableMode({ mode: "talent" })

    const ready = await quickStart(userId)
    const beforeSection = Number(ready.profile.completenessScore)

    const withReel = await api.talent.sections.create({ type: "showreel" })
    expect(withReel.profile.completenessScore).toBeGreaterThan(beforeSection)
    const [stored] = await db
      .select({ completenessScore: schema.talentProfiles.completenessScore })
      .from(schema.talentProfiles)
      .where(eq(schema.talentProfiles.userId, userId))
      .limit(1)
    expect(Number(stored?.completenessScore)).toBe(withReel.profile.completenessScore)

    const published = await api.talent.studio.publish()
    expect(published.profile.status).toBe("live")
    expect(published.profile.publishedAt).toBeTruthy()
    expect(published.profile.qualityScore).toBeGreaterThan(0)
    const publishedAt = published.profile.publishedAt
    const quality = published.profile.qualityScore

    await ensureEthnicity()
    const afterSensitive = await api.talent.attributes.set({
      definitionKey: "ethnicity",
      valueText: "black",
    })
    expect(afterSensitive.profile.completenessScore).toBe(
      published.profile.completenessScore
    )

    const republished = await api.talent.studio.publish()
    expect(republished.profile.qualityScore).toBe(quality)
    expect(republished.profile.publishedAt).toBe(publishedAt)

    await db.insert(schema.credits).values({
      talentId: userId,
      title: "The Lagoon",
      roleName: "Lead",
    })
    const withCredit = await api.talent.studio.publish()
    expect(withCredit.profile.qualityScore).toBeGreaterThan(quality)

    const draft = await api.talent.studio.unpublish()
    expect(draft.profile.status).toBe("draft")
    expect(draft.profile.publishedAt).toBe(publishedAt)

    await db
      .update(schema.talentProfiles)
      .set({ status: "suspended" })
      .where(eq(schema.talentProfiles.userId, userId))
    await expect(api.talent.studio.publish()).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(api.talent.studio.unpublish()).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })
})
