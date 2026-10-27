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
const createdAccentIds: string[] = []
const createdAttributeDefinitionIds: string[] = []

const stubAuth: AuthClient = {
  requestOtp: async () => {},
  verifyOtp: async () => {
    throw new Error("unused")
  },
  refresh: async () => {
    throw new Error("unused")
  },
}

function caller(userId: string | null) {
  return appRouter.createCaller({
    db,
    ip: "203.0.113.92",
    requestId: "public-integration",
    authorization: userId ? "Bearer test-token" : null,
    auth: stubAuth,
    verifyAccessToken: async () => {
      if (!userId) throw new Error("anonymous")
      return { userId }
    },
  })
}

const anonymous = caller(null)

async function ensureCityId() {
  const slug = `public-city-${randomUUID().slice(0, 8)}`
  const [created] = await db
    .insert(schema.cities)
    .values({ slug, name: "Ibadan" })
    .returning({ id: schema.cities.id })
  if (!created) throw new Error("city insert failed")
  createdCityIds.push(created.id)
  return created.id
}

async function ensureSkillIds() {
  const ids: string[] = []
  for (const name of ["Stage combat", "Improvisation", "Voice"]) {
    const [created] = await db
      .insert(schema.skills)
      .values({ slug: `public-skill-${randomUUID().slice(0, 8)}`, name })
      .returning({ id: schema.skills.id })
    if (!created) throw new Error("skill insert failed")
    createdSkillIds.push(created.id)
    ids.push(created.id)
  }
  return ids
}

const tag = () => randomUUID().slice(0, 8)

/** Profile rows for every list section, including attributes the public must never see. */
async function seedListRows(userId: string) {
  await db.insert(schema.credits).values([
    { talentId: userId, title: "The Lagoon", roleName: "Lead", year: 2025, isSignature: true, verifiedAt: new Date() },
    { talentId: userId, title: "Market Day", year: 2023, sort: 1 },
  ])

  const [yoruba] = await db
    .insert(schema.languages)
    .values({ slug: `public-lang-${tag()}`, name: "Yoruba" })
    .returning({ id: schema.languages.id })
  const [lagos] = await db
    .insert(schema.accents)
    .values({ slug: `public-accent-${tag()}`, name: "Lagos" })
    .returning({ id: schema.accents.id })
  if (!yoruba || !lagos) throw new Error("taxonomy insert failed")
  createdLanguageIds.push(yoruba.id)
  createdAccentIds.push(lagos.id)
  await db.insert(schema.talentLanguages).values({ talentId: userId, languageId: yoruba.id, fluency: "native" })
  await db.insert(schema.talentAccents).values({ talentId: userId, accentId: lagos.id })

  const definitions = await db
    .insert(schema.attributeDefinitions)
    .values([
      { key: `public_height_${tag()}`, label: "Height", dataType: "number", tier: "standard" },
      { key: `public_build_${tag()}`, label: "Build", dataType: "text", tier: "standard" },
      { key: `public_heritage_${tag()}`, label: "Heritage", dataType: "text", tier: "sensitive" },
    ])
    .returning({ id: schema.attributeDefinitions.id, label: schema.attributeDefinitions.label })
  createdAttributeDefinitionIds.push(...definitions.map((d) => d.id))
  const definitionId = (label: string) => definitions.find((d) => d.label === label)!.id
  await db.insert(schema.talentAttributes).values([
    { talentId: userId, definitionId: definitionId("Height"), valueNum: "172" },
    { talentId: userId, definitionId: definitionId("Build"), valueText: "Athletic", isVisible: false },
    { talentId: userId, definitionId: definitionId("Heritage"), valueText: "Sensitive value" },
  ])

  await db.insert(schema.talentAvailability).values({ talentId: userId, month: "2026-11", status: "partial" })
}

/** A live talent with a hidden about section, a public rate, and a rates section. */
async function publishedTalent(label: string) {
  const userId = await seedAuthUser(label, adult)
  seededUserIds.push(userId)
  const api = caller(userId)
  await api.auth.enableMode({ mode: "talent" })
  const photos = await api.talent.studio.createPlaceholderPhotos({ count: 3 })
  await api.talent.studio.completeQuickStart({
    displayName: "Tunde Adeyemi",
    cityId: await ensureCityId(),
    bio: "Actor based in Ibadan.",
    skillIds: await ensureSkillIds(),
    photoMediaIds: photos.mediaIds,
  })
  await db
    .update(schema.talentProfiles)
    .set({ headline: "Actor · Ibadan" })
    .where(eq(schema.talentProfiles.userId, userId))

  const withAbout = await api.talent.sections.create({ type: "about" })
  const about = withAbout.talent.sections.filter((s) => s.type === "about").at(-1)
  if (!about) throw new Error("about section missing")
  await api.talent.sections.update({
    sectionId: about.id,
    schemaVersion: about.schemaVersion,
    config: { body: "Hidden draft bio" },
    isVisible: false,
  })
  await api.talent.sections.create({ type: "rates" })
  await db.insert(schema.talentRates).values({
    talentId: userId,
    kind: "day",
    amountMin: "150000",
    currency: "NGN",
  })

  const published = await api.talent.studio.publish()
  return { userId, api, slug: published.talent.profile.slug }
}

describe("talent.public", () => {
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
    while (createdAccentIds.length > 0) {
      const id = createdAccentIds.pop()
      if (id) await db.delete(schema.accents).where(eq(schema.accents.id, id))
    }
    while (createdAttributeDefinitionIds.length > 0) {
      const id = createdAttributeDefinitionIds.pop()
      if (id) {
        await db
          .delete(schema.attributeDefinitions)
          .where(eq(schema.attributeDefinitions.id, id))
      }
    }
    while (createdCityIds.length > 0) {
      const id = createdCityIds.pop()
      if (id) await db.delete(schema.cities).where(eq(schema.cities.id, id))
    }
  })

  it("serves a live portfolio to an anonymous visitor without owner-only data", async () => {
    const { slug } = await publishedTalent("public-live")

    const portfolio = await anonymous.talent.public.bySlug({ slug: slug.toUpperCase() })
    expect(portfolio.talent.profile.displayName).toBe("Tunde Adeyemi")
    expect(portfolio.talent.profile.headline).toBe("Actor · Ibadan")
    expect(portfolio.talent.profile.cityName).toBe("Ibadan")
    expect(portfolio.talent.profile).not.toHaveProperty("status")
    expect(portfolio.talent.profile).not.toHaveProperty("completenessScore")
    expect(portfolio.talent.sections.every((s) => s.isVisible)).toBe(true)
    expect(JSON.stringify(portfolio)).not.toContain("Hidden draft bio")
    expect(portfolio.talent.content.skills.map((s) => s.name)).toEqual([
      "Improvisation",
      "Stage combat",
      "Voice",
    ])
    expect(portfolio.talent.rates).toEqual([
      expect.objectContaining({ kind: "day", amountMin: 150000 }),
    ])
    for (const media of Object.values(portfolio.media)) {
      expect(media.status).toBe("ready")
    }

    const slugs = await anonymous.talent.public.liveSlugs()
    expect(slugs.map((s) => s.slug)).toContain(slug)
  })

  it("omits rates and the rates section when rate visibility is hidden", async () => {
    const { userId, slug } = await publishedTalent("public-rates")
    await db
      .update(schema.talentProfiles)
      .set({ rateVisibility: "hidden" })
      .where(eq(schema.talentProfiles.userId, userId))

    const portfolio = await anonymous.talent.public.bySlug({ slug })
    expect(portfolio.talent).not.toHaveProperty("rates")
    expect(portfolio.talent.sections.map((s) => s.type)).not.toContain("rates")
    expect(JSON.stringify(portfolio)).not.toContain("150000")

    // The owner's studio (the mobile preview) still has the rate and the rates section.
    const studio = await caller(userId).talent.studio.get()
    expect(studio.talent.rates).toEqual([expect.objectContaining({ kind: "day", amountMin: 150000 })])
    expect(studio.talent.sections.map((s) => s.type)).toContain("rates")
  })

  it("sends public list rows and drops hidden or sensitive attributes", async () => {
    const { userId, slug } = await publishedTalent("public-rows")
    await seedListRows(userId)

    const { content } = (await anonymous.talent.public.bySlug({ slug })).talent
    expect(content.credits.map((c) => [c.title, c.verified])).toEqual([
      ["The Lagoon", true],
      ["Market Day", false],
    ])
    expect(content.languages).toEqual([{ name: "Yoruba", fluency: "native" }])
    expect(content.accents).toEqual([{ name: "Lagos" }])
    expect(content.availability).toEqual([{ month: "2026-11", status: "partial" }])
    expect(content.attributes).toEqual([{ label: "Height", value: "172" }])

    const payload = JSON.stringify(await anonymous.talent.public.bySlug({ slug }))
    expect(payload).not.toContain("Athletic")
    expect(payload).not.toContain("Sensitive value")
    expect(payload).not.toContain("Heritage")
  })

  it("leaves quarantined media out of the public payload", async () => {
    const { userId, slug } = await publishedTalent("public-quarantine")
    const before = await anonymous.talent.public.bySlug({ slug })
    const [quarantined] = Object.keys(before.media)
    expect(quarantined).toBeDefined()

    await db
      .update(schema.mediaAssets)
      .set({ status: "quarantined" })
      .where(eq(schema.mediaAssets.id, quarantined!))
    const after = await anonymous.talent.public.bySlug({ slug })
    expect(after.media).not.toHaveProperty(quarantined!)
    // The owner can still see it in the studio, flagged, to replace it.
    const studio = await caller(userId).talent.studio.get()
    expect(studio.media[quarantined!]?.status).toBe("quarantined")
  })

  it("returns NOT_FOUND for draft, suspended, and unknown slugs", async () => {
    const { userId, api, slug } = await publishedTalent("public-gone")

    await api.talent.studio.unpublish()
    await expect(anonymous.talent.public.bySlug({ slug })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    expect((await anonymous.talent.public.liveSlugs()).map((s) => s.slug)).not.toContain(slug)

    await db
      .update(schema.talentProfiles)
      .set({ status: "suspended" })
      .where(eq(schema.talentProfiles.userId, userId))
    await expect(anonymous.talent.public.bySlug({ slug })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })

    await expect(
      anonymous.talent.public.bySlug({ slug: "no-such-talent-here" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(anonymous.talent.public.bySlug({ slug: "../etc" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })
})
