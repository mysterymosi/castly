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
    expect(portfolio.skills.map((s) => s.name).sort()).toEqual([
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
