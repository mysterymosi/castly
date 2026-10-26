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
const createdLanguageIds: string[] = []

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
  const ids: string[] = []
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
    while (createdLanguageIds.length > 0) {
      const id = createdLanguageIds.pop()
      if (id) await db.delete(schema.languages).where(eq(schema.languages.id, id))
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
    const beforeSection = Number(ready.talent.profile.completenessScore)

    const withReel = await api.talent.sections.create({ type: "showreel" })
    expect(withReel.talent.profile.completenessScore).toBeGreaterThan(beforeSection)
    const [stored] = await db
      .select({ completenessScore: schema.talentProfiles.completenessScore })
      .from(schema.talentProfiles)
      .where(eq(schema.talentProfiles.userId, userId))
      .limit(1)
    expect(Number(stored?.completenessScore)).toBe(withReel.talent.profile.completenessScore)

    const published = await api.talent.studio.publish()
    expect(published.talent.profile.status).toBe("live")
    expect(published.talent.profile.publishedAt).toBeTruthy()
    expect(published.talent.profile.qualityScore).toBeGreaterThan(0)
    const publishedAt = published.talent.profile.publishedAt
    const quality = published.talent.profile.qualityScore

    await ensureEthnicity()
    const afterSensitive = await api.talent.attributes.set({
      definitionKey: "ethnicity",
      valueText: "black",
    })
    expect(afterSensitive.talent.profile.completenessScore).toBe(
      published.talent.profile.completenessScore
    )

    const republished = await api.talent.studio.publish()
    expect(republished.talent.profile.qualityScore).toBe(quality)
    expect(republished.talent.profile.publishedAt).toBe(publishedAt)

    await db.insert(schema.credits).values({
      talentId: userId,
      title: "The Lagoon",
      roleName: "Lead",
    })
    const withCredit = await api.talent.studio.publish()
    expect(withCredit.talent.profile.qualityScore).toBeGreaterThan(quality)

    const draft = await api.talent.studio.unpublish()
    expect(draft.talent.profile.status).toBe("draft")
    expect(draft.talent.profile.publishedAt).toBe(publishedAt)

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

  it("keeps exactly one talent_search row in sync through publish, languages, and unpublish", async () => {
    const userId = await seedAuthUser("publish-search", adult)
    seededUserIds.push(userId)
    const api = talentCaller(userId)
    await api.auth.enableMode({ mode: "talent" })
    await quickStart(userId)
    await api.talent.sections.create({ type: "showreel" })

    const searchRows = () =>
      db
        .select()
        .from(schema.talentSearch)
        .where(eq(schema.talentSearch.talentId, userId))

    const published = await api.talent.studio.publish()
    const [live, ...extra] = await searchRows()
    expect(extra).toHaveLength(0)
    expect(live?.status).toBe("live")
    expect(live?.cityId).toBe(published.talent.profile.cityId)
    expect(live?.skillIds).toHaveLength(3)
    expect(live?.hasShowreel).toBe(true)
    expect(Number(live?.qualityScore)).toBe(published.talent.profile.qualityScore)
    expect(Number(live?.completenessScore)).toBe(published.talent.profile.completenessScore)
    expect(Number(live?.freshnessScore)).toBeGreaterThan(0)

    const [language] = await db
      .insert(schema.languages)
      .values({ slug: `yoruba-${randomUUID().slice(0, 8)}`, name: "Yoruba" })
      .returning({ id: schema.languages.id })
    if (!language) throw new Error("language insert failed")
    createdLanguageIds.push(language.id)
    await db
      .insert(schema.talentLanguages)
      .values({ talentId: userId, languageId: language.id, fluency: "native" })

    const [withYoruba, ...extraAfter] = await searchRows()
    expect(extraAfter).toHaveLength(0)
    expect(withYoruba?.languageIds).toEqual([language.id])
    expect(withYoruba?.searchTsv).toContain("'yoruba'")
    expect(withYoruba?.qualityScore).toBe(live?.qualityScore)

    await api.talent.studio.unpublish()
    const [draft] = await searchRows()
    expect(draft?.status).toBe("draft")
  })

  it("serialises the studio through serializeTalent, so the owner still sees hidden rates", async () => {
    const userId = await seedAuthUser("publish-rates", adult)
    seededUserIds.push(userId)
    const api = talentCaller(userId)
    await api.auth.enableMode({ mode: "talent" })
    await quickStart(userId)

    await db
      .insert(schema.talentRates)
      .values({ talentId: userId, kind: "day", amountMin: "50000", amountMax: "80000" })
    await db
      .update(schema.talentProfiles)
      .set({ rateVisibility: "hidden" })
      .where(eq(schema.talentProfiles.userId, userId))

    const state = await api.talent.studio.get()
    expect(state.talent.profile.rateVisibility).toBe("hidden")
    expect(state.talent.rates).toEqual([
      { kind: "day", amountMin: 50000, amountMax: 80000, currency: "NGN", negotiable: true },
    ])
  })

  it("returns sections at the current schema version, so an old row can be saved back", async () => {
    const userId = await seedAuthUser("section-version", adult)
    seededUserIds.push(userId)
    const api = talentCaller(userId)
    await api.auth.enableMode({ mode: "talent" })
    await api.talent.studio.get()

    const [heroRow] = await db
      .insert(schema.portfolioSections)
      .values({
        talentId: userId,
        type: "hero",
        position: 0,
        schemaVersion: 1,
        config: { style: "split", mediaId: null, headline: "Old hero", showBadges: true },
      })
      .returning({ id: schema.portfolioSections.id })
    if (!heroRow) throw new Error("hero insert failed")

    const state = await api.talent.studio.get()
    const hero = state.talent.sections.find((section) => section.id === heroRow.id)
    expect(hero?.schemaVersion).toBe(2)

    const saved = await api.talent.sections.update({
      sectionId: heroRow.id,
      schemaVersion: hero!.schemaVersion,
      config: { ...(hero!.config as object), headline: "New hero" },
    })
    const after = saved.talent.sections.find((section) => section.id === heroRow.id)
    expect(after?.schemaVersion).toBe(2)
    expect(after?.config).toMatchObject({ headline: "New hero" })
  })
})

