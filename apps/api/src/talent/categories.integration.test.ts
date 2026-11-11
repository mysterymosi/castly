import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { eq, inArray } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import type { AuthClient } from "../auth/supabase.js"
import { db } from "../db.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { appRouter } from "../trpc/router.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []
const createdCategoryIds: string[] = []

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
    ip: "203.0.113.93",
    requestId: "categories-integration",
    authorization: "Bearer test-token",
    auth: stubAuth,
    verifyAccessToken: async () => ({ userId }),
  })
}

async function category(active = true) {
  const slug = `cat-${randomUUID().slice(0, 8)}`
  const [row] = await db
    .insert(schema.categories)
    .values({ slug, name: slug, kind: "on_camera", active })
    .returning({ id: schema.categories.id })
  if (!row) throw new Error("category insert failed")
  createdCategoryIds.push(row.id)
  return row.id
}

async function talent(suffix: string) {
  const userId = await seedAuthUser(suffix, adult)
  seededUserIds.push(userId)
  const api = talentCaller(userId)
  await api.auth.enableMode({ mode: "talent" })
  await api.talent.studio.get()
  return { userId, api }
}

describe("talent categories", () => {
  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
    if (createdCategoryIds.length > 0) {
      await db.delete(schema.categories).where(inArray(schema.categories.id, createdCategoryIds))
      createdCategoryIds.length = 0
    }
  })

  it("replaces the talent's categories, primary first, and reaches the search projection", async () => {
    const { userId, api } = await talent("categories-set")
    const [models, actors, dancers] = [await category(), await category(), await category()]

    const first = await api.talent.categories.set({ categoryIds: [models, actors] })
    expect(first.categoryIds).toEqual([models, actors])
    expect(first.categories.map((c) => c.id)).toEqual(expect.arrayContaining([models, actors, dancers]))

    const second = await api.talent.categories.set({ categoryIds: [dancers, models] })
    expect(second.categoryIds).toEqual([dancers, models])
    const rows = await db
      .select()
      .from(schema.talentCategories)
      .where(eq(schema.talentCategories.talentId, userId))
    expect(rows.find((r) => r.isPrimary)?.categoryId).toBe(dancers)
    expect(rows).toHaveLength(2)

    const [search] = await db
      .select({ categoryIds: schema.talentSearch.categoryIds })
      .from(schema.talentSearch)
      .where(eq(schema.talentSearch.talentId, userId))
    expect([...(search?.categoryIds ?? [])].sort()).toEqual([dancers, models].sort())
  })

  it("rejects inactive, unknown, duplicate or missing categories without changing anything", async () => {
    const { api } = await talent("categories-reject")
    const kept = await category()
    await api.talent.categories.set({ categoryIds: [kept] })

    const retired = await category(false)
    await expect(api.talent.categories.set({ categoryIds: [retired] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(api.talent.categories.set({ categoryIds: [randomUUID()] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(api.talent.categories.set({ categoryIds: [kept, kept] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(api.talent.categories.set({ categoryIds: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    expect((await api.talent.studio.get()).categoryIds).toEqual([kept])
  })
})
