import { randomUUID } from "node:crypto"

import { serializeTalent } from "@workspace/core"
import { schema } from "@workspace/db"
import { attributeAppliesTo, availabilityMonthKey, type StudioState } from "@workspace/schema"
import { eq, inArray } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import type { AuthClient } from "../auth/supabase.js"
import { db } from "../db.js"
import { deckCard } from "../deck/preview.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { appRouter } from "../trpc/router.js"
import { loadTalentRecord } from "./record.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []
const createdSkillIds: string[] = []
const createdCityIds: string[] = []
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

function caller(userId: string) {
  return appRouter.createCaller({
    db,
    ip: "203.0.113.94",
    requestId: "content-integration",
    authorization: "Bearer test-token",
    auth: stubAuth,
    verifyAccessToken: async () => ({ userId }),
  })
}

async function categoryId(slug: string) {
  const [row] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(eq(schema.categories.slug, slug))
    .limit(1)
  if (!row) throw new Error(`seed category ${slug} missing; run the db seed`)
  return row.id
}

async function tempRow(table: typeof schema.skills | typeof schema.cities | typeof schema.languages, prefix: string, active = true) {
  const slug = `${prefix}-${randomUUID().slice(0, 8)}`
  const [row] = await db.insert(table).values({ slug, name: slug, active }).returning({ id: table.id })
  if (!row) throw new Error(`${prefix} insert failed`)
  const list = table === schema.skills ? createdSkillIds : table === schema.cities ? createdCityIds : createdLanguageIds
  list.push(row.id)
  return row.id
}

/** A quick-started talent in `category`, ready to publish. */
async function talent(suffix: string, category = "models") {
  const userId = await seedAuthUser(suffix, adult)
  seededUserIds.push(userId)
  const api = caller(userId)
  await api.auth.enableMode({ mode: "talent" })
  const photos = await api.talent.studio.createPlaceholderPhotos({ count: 3 })
  const state = await api.talent.studio.completeQuickStart({
    displayName: "Kemi Lawal",
    cityId: await tempRow(schema.cities, "content-city"),
    bio: "Model in Lagos.",
    skillIds: [
      await tempRow(schema.skills, "content-skill"),
      await tempRow(schema.skills, "content-skill"),
      await tempRow(schema.skills, "content-skill"),
    ],
    photoMediaIds: photos.mediaIds,
    categoryIds: [await categoryId(category)],
  })
  return { userId, api, state }
}

async function searchRow(userId: string) {
  const [row] = await db
    .select()
    .from(schema.talentSearch)
    .where(eq(schema.talentSearch.talentId, userId))
    .limit(1)
  if (!row) throw new Error("search row missing")
  return row
}

async function profileRow(userId: string) {
  const [row] = await db
    .select()
    .from(schema.talentProfiles)
    .where(eq(schema.talentProfiles.userId, userId))
    .limit(1)
  if (!row) throw new Error("profile missing")
  return row
}

/** What another signed-in, unverified user receives. */
async function asStranger(userId: string) {
  const record = await loadTalentRecord(db, await profileRow(userId), 0)
  return serializeTalent(record, { kind: "user", userId: randomUUID(), verifiedBooker: false }, {})
}

function definition(state: StudioState, key: string) {
  const found = state.editor.attributeDefinitions.find((d) => d.key === key)
  if (!found) throw new Error(`definition ${key} missing; run the db seed`)
  return found
}

describe("studio content", () => {
  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
    for (const [table, ids] of [
      [schema.skills, createdSkillIds],
      [schema.cities, createdCityIds],
      [schema.languages, createdLanguageIds],
    ] as const) {
      if (ids.length > 0) await db.delete(table).where(inArray(table.id, ids))
      ids.length = 0
    }
  })

  it("credits: create, reorder and delete round-trip, one signature, verifiedAt untouchable", async () => {
    const { userId, api, state } = await talent("content-credits")
    const before = state.completeness.score

    // An empty Credits section scores nothing.
    const withSection = await api.talent.sections.create({ type: "credits" })
    expect(withSection.completeness.score).toBe(before)

    const one = await api.talent.credits.create({
      title: "Ìjọ̀ba",
      roleName: "Lead",
      year: 2024,
      type: "film",
      isSignature: true,
      // Not part of the input schema: stripped, never stored.
      ...({ verifiedAt: new Date().toISOString() } as object),
    })
    expect(one.completeness.score).toBeGreaterThan(before)
    expect(one.editor.credits[0]).toMatchObject({ title: "Ìjọ̀ba", isSignature: true, verified: false })
    const [stored] = await db.select().from(schema.credits).where(eq(schema.credits.talentId, userId))
    expect(stored?.verifiedAt).toBeNull()

    const two = await api.talent.credits.create({ title: "Lagos Nights", isSignature: true, link: "" })
    const signatures = two.editor.credits.filter((c) => c.isSignature)
    expect(signatures.map((c) => c.title)).toEqual(["Lagos Nights"])
    expect(two.talent.content.credits.map((c) => c.title)).toEqual(["Ìjọ̀ba", "Lagos Nights"])
    expect((await searchRow(userId)).creditCount).toBe(2)

    const ids = two.editor.credits.map((c) => c.id)
    const reordered = await api.talent.credits.reorder({ creditIds: [...ids].reverse() })
    expect(reordered.talent.content.credits.map((c) => c.title)).toEqual(["Lagos Nights", "Ìjọ̀ba"])
    await expect(api.talent.credits.reorder({ creditIds: [ids[0]!] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })

    const booker = await talent("content-credits-booker")
    const card = await deckCard(db, booker.userId, await profileRow(userId))
    expect(card.decision.signatureCredit?.title).toBe("Lagos Nights")

    const other = await talent("content-credits-other")
    await expect(other.api.talent.credits.delete({ creditId: ids[0]! })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    const deleted = await api.talent.credits.delete({ creditId: ids[1]! })
    expect(deleted.talent.content.credits.map((c) => c.title)).toEqual(["Ìjọ̀ba"])
    expect((await searchRow(userId)).creditCount).toBe(1)
  })

  it("languages and accents reach the projection; a retired language is rejected", async () => {
    const { userId, api, state } = await talent("content-languages")
    const [yoruba, english] = state.editor.languageOptions
    if (!yoruba || !english) throw new Error("seed languages missing")
    const accent = state.editor.accentOptions[0]
    if (!accent) throw new Error("seed accents missing")

    await api.talent.languages.set({
      languages: [
        { languageId: yoruba.id, fluency: "native" },
        { languageId: english.id, fluency: "fluent" },
      ],
    })
    const after = await api.talent.accents.set({ accentIds: [accent.id] })
    expect(after.talent.content.languages).toEqual([
      { name: yoruba.name, fluency: "native" },
      { name: english.name, fluency: "fluent" },
    ])
    expect(after.talent.content.accents).toEqual([{ name: accent.name }])
    expect(after.talent.sections.some((s) => s.type === "languages")).toBe(true)
    const row = await searchRow(userId)
    expect([...row.languageIds].sort()).toEqual([yoruba.id, english.id].sort())
    expect(row.accentIds).toEqual([accent.id])

    const retired = await tempRow(schema.languages, "content-retired", false)
    await expect(
      api.talent.languages.set({ languages: [{ languageId: retired, fluency: "basic" }] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rates: hidden rates are absent for others and from search; visibility never moves scores", async () => {
    const { userId, api } = await talent("content-rates")
    const set = await api.talent.rates.set({
      rates: [
        { kind: "day", amountMin: 150_000, amountMax: 250_000, currency: "NGN", negotiable: true },
        { kind: "project", amountMin: null, amountMax: null, currency: "NGN", negotiable: true },
      ],
    })
    expect(set.talent.rates).toHaveLength(2)
    await api.talent.studio.publish()
    const live = await profileRow(userId)
    expect(Number((await searchRow(userId)).rateDayMin)).toBe(150_000)

    const hidden = await api.talent.studio.updateProfile({ rateVisibility: "hidden" })
    expect(hidden.talent.rates).toHaveLength(2)
    expect(await asStranger(userId)).not.toHaveProperty("rates")
    expect((await searchRow(userId)).rateDayMin).toBeNull()
    const after = await profileRow(userId)
    expect(after.completenessScore).toBe(live.completenessScore)
    expect(after.qualityScore).toBe(live.qualityScore)

    await expect(
      api.talent.rates.set({
        rates: [{ kind: "day", amountMin: 300, amountMax: 100, currency: "NGN", negotiable: false }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("availability: fills the horizon, rejects past months", async () => {
    const { api } = await talent("content-availability")
    const now = new Date()
    const next = availabilityMonthKey(now, 1)
    const set = await api.talent.availability.set({
      months: [
        { month: availabilityMonthKey(now), status: "available" },
        { month: next, status: "booked" },
      ],
    })
    expect(set.talent.content.availability).toEqual([
      { month: availabilityMonthKey(now), status: "available" },
      { month: next, status: "booked" },
    ])
    await expect(
      api.talent.availability.set({ months: [{ month: availabilityMonthKey(now, -1), status: "booked" }] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      api.talent.availability.set({ months: [{ month: availabilityMonthKey(now, 12), status: "booked" }] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("attributes: by category, typed, hideable, and sensitive values never score", async () => {
    const { userId, api, state } = await talent("content-attributes")
    const parentOf = (id: string) => state.categories.find((c) => c.id === id)?.parentId
    const height = definition(state, "height_cm")
    expect(attributeAppliesTo(height, state.categoryIds, parentOf)).toBe(true)
    expect(attributeAppliesTo(definition(state, "waist_cm"), state.categoryIds, parentOf)).toBe(true)
    const makeup = await categoryId("makeup-and-hair")
    expect(attributeAppliesTo(height, [makeup], parentOf)).toBe(false)
    expect(attributeAppliesTo(definition(state, "experience_years"), [makeup], parentOf)).toBe(true)
    // Taxonomy keys have their own editors.
    expect(state.editor.attributeDefinitions.some((d) => d.key === "languages")).toBe(false)

    await api.talent.studio.publish()
    const baseline = await profileRow(userId)

    const sensitive = await api.talent.attributes.set({ definitionKey: "complexion", valueText: "deep" })
    expect(sensitive.talent.content.attributes).toEqual([])
    const afterSensitive = await profileRow(userId)
    expect(afterSensitive.completenessScore).toBe(baseline.completenessScore)
    expect(afterSensitive.qualityScore).toBe(baseline.qualityScore)
    expect(sensitive.talent.sections.some((s) => s.type === "attributes")).toBe(false)

    await expect(
      api.talent.attributes.set({ definitionKey: "hair", valueText: "purple" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      api.talent.attributes.set({ definitionKey: "height_cm", valueText: "tall" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const hair = await api.talent.attributes.set({ definitionKey: "eye_colour", valueText: "dark_brown" })
    expect(hair.talent.content.attributes).toEqual([{ label: "Eye colour", value: "Dark brown" }])
    expect(hair.completeness.score).toBeGreaterThan(Number(baseline.completenessScore))
    await api.talent.attributes.set({ definitionKey: "height_cm", valueNum: 178 })
    expect((await asStranger(userId)).content.attributes.map((a) => a.label)).toContain("Height (cm)")

    const hidden = await api.talent.attributes.set({ definitionKey: "height_cm", isVisible: false })
    expect(hidden.editor.attributes.find((a) => a.definitionId === height.id)).toMatchObject({
      valueNum: 178,
      isVisible: false,
    })
    expect((await asStranger(userId)).content.attributes.map((a) => a.label)).not.toContain("Height (cm)")

    const cleared = await api.talent.attributes.set({ definitionKey: "height_cm" })
    expect(cleared.editor.attributes.some((a) => a.definitionId === height.id)).toBe(false)
  })

  it("previews the card exactly as a booker gets it", async () => {
    const { api } = await talent("content-preview")
    await api.talent.rates.set({
      rates: [{ kind: "day", amountMin: 100_000, amountMax: null, currency: "NGN", negotiable: true }],
    })
    await api.talent.studio.updateProfile({ rateVisibility: "hidden" })
    const card = await api.talent.studio.previewCard()
    expect(card.talent.profile.displayName).toBe("Kemi Lawal")
    // Owner-only fields and hidden rates are absent, as for any booker.
    expect(card.talent.profile).not.toHaveProperty("status")
    expect(card.talent).not.toHaveProperty("rates")
    expect(card.decision.leadMediaIds).toHaveLength(1)
  })

  it("profile basics reach the projection; publishing needs a category", async () => {
    const { userId, api } = await talent("content-basics")
    const lagos = await tempRow(schema.cities, "content-city-2")
    const edited = await api.talent.studio.updateProfile({
      headline: "  Runway and editorial  ",
      willingToTravel: true,
      cityId: lagos,
    })
    expect(edited.talent.profile.headline).toBe("Runway and editorial")
    expect(edited.editor.willingToTravel).toBe(true)
    expect((await searchRow(userId)).cityId).toBe(lagos)

    await db.delete(schema.talentCategories).where(eq(schema.talentCategories.talentId, userId))
    await expect(api.talent.studio.publish()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringMatching(/what you do/i),
    })
  })
})
