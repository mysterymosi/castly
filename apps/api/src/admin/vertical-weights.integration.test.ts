import { randomUUID } from "node:crypto"

import { verticalCategoryMatch } from "@workspace/core"
import { schema } from "@workspace/db"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { loadVerticalCategoryWeights } from "../booker/vertical-weights.js"
import { db } from "../db.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { createContext } from "../trpc/context.js"
import { appRouter } from "../trpc/router.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []
const createdCategoryIds: string[] = []

function caller(userId: string, headers: Record<string, string> = {}) {
  const request = new Request("http://api.test/trpc", {
    headers: { authorization: "Bearer test-token", "x-forwarded-for": "203.0.113.94", ...headers },
  })
  return appRouter.createCaller({
    ...createContext(request),
    verifyAccessToken: async () => ({ userId }),
  })
}

async function newUser(label: string) {
  const userId = await seedAuthUser(label, adult)
  seededUserIds.push(userId)
  return userId
}

/** Admin mode is granted by ops, never self-enabled, so tests write the row directly. */
async function newAdmin(label: string) {
  const userId = await newUser(label)
  await db.insert(schema.userModes).values({ userId, mode: "admin" })
  return userId
}

async function createCategory() {
  const [category] = await db
    .insert(schema.categories)
    .values({ slug: `weights-${randomUUID().slice(0, 8)}`, name: "Presenters", kind: "on_camera" })
    .returning({ id: schema.categories.id })
  if (!category) throw new Error("category insert failed")
  createdCategoryIds.push(category.id)
  return category.id
}

describe("admin.verticalWeights", () => {
  afterEach(async () => {
    while (createdCategoryIds.length > 0) {
      const id = createdCategoryIds.pop()
      // Cascades to the category's weight rows.
      if (id) await db.delete(schema.categories).where(eq(schema.categories.id, id))
    }
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
  })

  it("is admin-only, whatever the client claims", async () => {
    const booker = await newUser("weights-booker")
    const api = caller(booker, { mode: "admin", "x-mode": "admin" })
    await api.auth.enableMode({ mode: "booker" })
    await expect(api.admin.verticalWeights.list()).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      api.admin.verticalWeights.update({
        vertical: "casting_director",
        categoryId: randomUUID(),
        weight: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("an admin edit is what the deck's weight reader returns next", async () => {
    const adminId = await newAdmin("weights-admin")
    const presenters = await createCategory()
    const api = caller(adminId)

    expect((await loadVerticalCategoryWeights(db, "casting_director"))[presenters]).toBeUndefined()

    const listed = await api.admin.verticalWeights.update({
      vertical: "casting_director",
      categoryId: presenters,
      weight: 0.35,
    })
    expect(listed.categories.map((c) => c.id)).toContain(presenters)
    expect(listed.weights).toContainEqual(
      expect.objectContaining({
        vertical: "casting_director",
        categoryId: presenters,
        weight: 0.35,
        updatedBy: adminId,
      })
    )

    const weights = await loadVerticalCategoryWeights(db, "casting_director")
    expect(weights[presenters]).toBe(0.35)
    expect(verticalCategoryMatch([presenters], weights)).toBe(0.35)

    await api.admin.verticalWeights.update({
      vertical: "casting_director",
      categoryId: presenters,
      weight: 0.9,
    })
    const changed = await loadVerticalCategoryWeights(db, "casting_director")
    expect(verticalCategoryMatch([presenters], changed)).toBe(0.9)
    // Other verticals are untouched.
    expect((await loadVerticalCategoryWeights(db, "event_planner"))[presenters]).toBeUndefined()
  })

  it("rejects out-of-range weights and unknown categories", async () => {
    const adminId = await newAdmin("weights-invalid")
    const presenters = await createCategory()
    const api = caller(adminId)

    await expect(
      api.admin.verticalWeights.update({ vertical: "director", categoryId: presenters, weight: 1.5 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      api.admin.verticalWeights.update({ vertical: "director", categoryId: randomUUID(), weight: 0.5 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})
