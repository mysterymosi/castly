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
const createdCategoryIds: string[] = []
const createdAttributeKeys: string[] = []
const createdLanguageIds: string[] = []

const brief =
  "Warm, confident lead for a bank's national TV spot. She explains a savings product to camera " +
  "in English and switches naturally into Yoruba for the closing line. Two shoot days in Lagos."

function caller(userId: string) {
  const request = new Request("http://api.test/trpc", {
    headers: { authorization: "Bearer test-token", "x-forwarded-for": "203.0.113.95" },
  })
  return appRouter.createCaller({
    ...createContext(request),
    verifyAccessToken: async () => ({ userId }),
  })
}

const tag = () => randomUUID().slice(0, 8)

async function newUser(label: string) {
  const userId = await seedAuthUser(label, adult)
  seededUserIds.push(userId)
  return userId
}

/** A booker with mode and profile, ready to create projects. */
async function newBooker(label: string) {
  const userId = await newUser(label)
  const api = caller(userId)
  await api.auth.enableMode({ mode: "booker" })
  const [city] = await db
    .insert(schema.cities)
    .values({ slug: `project-city-${tag()}`, name: "Lagos" })
    .returning({ id: schema.cities.id })
  createdCityIds.push(city!.id)
  await api.booker.updateProfile({
    vertical: "casting_director",
    companyName: null,
    cityId: city!.id,
    typicalProjectTypes: ["commercial"],
  })
  return { userId, api }
}

async function newCategory() {
  const [category] = await db
    .insert(schema.categories)
    .values({ slug: `project-actors-${tag()}`, name: "Actors", kind: "on_camera" })
    .returning({ id: schema.categories.id })
  createdCategoryIds.push(category!.id)
  return category!.id
}

/** Throwaway attribute definitions: one standard number, one sensitive select. */
async function newAttributes() {
  const height = `proj_height_${tag()}`
  const look = `proj_look_${tag()}`
  createdAttributeKeys.push(height, look)
  await db.insert(schema.attributeDefinitions).values([
    { key: height, label: "Height", dataType: "number", tier: "standard" },
    { key: look, label: "Look", dataType: "select", tier: "sensitive", options: ["a", "b"] },
  ])
  return { height, look }
}

/**
 * The `languages` definition comes from the seed, which CI does not run: create it when missing
 * and only clean up what this test created.
 */
async function ensureLanguagesDefinition() {
  const inserted = await db
    .insert(schema.attributeDefinitions)
    .values({ key: "languages", label: "Languages", dataType: "multi_select", tier: "standard" })
    .onConflictDoNothing({ target: schema.attributeDefinitions.key })
    .returning({ key: schema.attributeDefinitions.key })
  if (inserted.length > 0) createdAttributeKeys.push("languages")
  const slug = `test-yoruba-${tag()}`
  const [language] = await db
    .insert(schema.languages)
    .values({ slug, name: "Yoruba (test)" })
    .returning({ id: schema.languages.id })
  createdLanguageIds.push(language!.id)
  return slug
}

const noRoleExtras = {
  categoryId: null,
  shootStartsOn: null,
  shootEndsOn: null,
  rateMin: null,
  rateMax: null,
}

describe("project and role CRUD", () => {
  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
    if (createdAttributeKeys.length > 0) {
      await db
        .delete(schema.attributeDefinitions)
        .where(inArray(schema.attributeDefinitions.key, createdAttributeKeys.splice(0)))
    }
    for (const id of createdLanguageIds.splice(0)) {
      await db.delete(schema.languages).where(eq(schema.languages.id, id))
    }
    for (const id of createdCategoryIds.splice(0)) {
      await db.delete(schema.categories).where(eq(schema.categories.id, id))
    }
    for (const id of createdCityIds.splice(0)) {
      await db.delete(schema.cities).where(eq(schema.cities.id, id))
    }
  })

  it("creates a project with a briefed role, and archive hides it from the default list", async () => {
    const { api } = await newBooker("project-accept")
    const actors = await newCategory()

    const project = await api.project.create({ name: "Bank commercial — March", type: "commercial" })
    expect(project).toMatchObject({ status: "active", roleCount: 0, roles: [] })

    const withRole = await api.role.create({
      projectId: project.id,
      ...noRoleExtras,
      name: "Lead actress, 25–30, Yoruba-speaking",
      brief,
      categoryId: actors,
      shootStartsOn: "2027-03-08",
      shootEndsOn: "2027-03-09",
      rateMin: 150_000,
      rateMax: 300_000,
    })
    expect(withRole.roles).toHaveLength(1)
    expect(withRole.roles[0]).toMatchObject({
      name: "Lead actress, 25–30, Yoruba-speaking",
      brief,
      categoryId: actors,
      categoryName: "Actors",
      shootStartsOn: "2027-03-08",
      shootEndsOn: "2027-03-09",
      rateMin: 150000,
      rateMax: 300000,
      rateCurrency: "NGN",
      isPublished: false,
    })

    const listed = await api.project.list()
    expect(listed.projects).toEqual([
      expect.objectContaining({ id: project.id, roleCount: 1, status: "active" }),
    ])

    await api.project.archive({ projectId: project.id })
    expect((await api.project.list()).projects).toEqual([])
    expect((await api.project.list({ includeArchived: true })).projects).toEqual([
      expect.objectContaining({ id: project.id, status: "archived" }),
    ])
    // Archive is idempotent and archived projects are read-only.
    await api.project.archive({ projectId: project.id })
    await expect(
      api.role.create({ projectId: project.id, ...noRoleExtras, name: "Extra", brief: null })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await expect(
      api.project.update({ projectId: project.id, name: "Renamed", type: null })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  it("stores a blank brief as no brief and keeps roles unpublished", async () => {
    const { api } = await newBooker("project-publish")
    const project = await api.project.create({ name: "Music video" })
    const created = await api.role.create({
      projectId: project.id,
      ...noRoleExtras,
      name: "Lead dancer",
      brief: "   \n  ",
    })
    const role = created.roles[0]!
    expect(role.brief).toBeNull()

    await expect(api.role.publish({ roleId: role.id })).rejects.toMatchObject({ code: "FORBIDDEN" })

    // A client that smuggles isPublished in gets it stripped, not applied.
    const updated = await api.role.update({
      roleId: role.id,
      ...noRoleExtras,
      name: "Lead dancer",
      brief: "Afrobeats choreography, two days.",
      isPublished: true,
    } as Parameters<typeof api.role.update>[0])
    expect(updated.roles[0]).toMatchObject({
      brief: "Afrobeats choreography, two days.",
      isPublished: false,
    })
    const [stored] = await db
      .select({ isPublished: schema.roles.isPublished, publishedAt: schema.roles.publishedAt })
      .from(schema.roles)
      .where(eq(schema.roles.id, role.id))
    expect(stored).toEqual({ isPublished: false, publishedAt: null })
  })

  it("hides another booker's projects and roles", async () => {
    const owner = await newBooker("project-owner")
    const other = await newBooker("project-other")
    const project = await owner.api.project.create({ name: "Private" })
    const { roles } = await owner.api.role.create({
      projectId: project.id,
      ...noRoleExtras,
      name: "Lead",
      brief: null,
    })

    await expect(other.api.project.get({ projectId: project.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(other.api.project.archive({ projectId: project.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(
      other.api.role.update({ roleId: roles[0]!.id, ...noRoleExtras, name: "Hijack", brief: null })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect((await other.api.project.list()).projects).toEqual([])
  })

  it("validates requirements against attribute definitions and gates sensitive ones on a brief", async () => {
    const { api } = await newBooker("project-requirements")
    const { height, look } = await newAttributes()
    const project = await api.project.create({ name: "Feature film" })
    const base = { projectId: project.id, ...noRoleExtras, name: "Lead" }

    const ok = await api.role.create({
      ...base,
      brief: null,
      requirements: { [height]: { min: 160, max: 180 } },
    })
    expect(ok.roles[0]?.requirements).toEqual({ [height]: { min: 160, max: 180 } })

    for (const requirements of [
      { proj_unknown_key: { min: 1 } },
      { [height]: { anyOf: ["tall"] } },
      { [look]: { anyOf: ["c"] } },
    ]) {
      await expect(api.role.create({ ...base, brief, requirements })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      })
    }

    await expect(
      api.role.create({ ...base, brief: null, requirements: { [look]: { anyOf: ["a"] } } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("brief") })
    const briefed = await api.role.create({
      ...base,
      brief,
      requirements: { [look]: { anyOf: ["a"] } },
    })
    expect(briefed.roles.at(-1)?.requirements).toEqual({ [look]: { anyOf: ["a"] } })
  })

  it("needs booker mode and a booker profile", async () => {
    const talent = await newUser("project-talent")
    const talentApi = caller(talent)
    await talentApi.auth.enableMode({ mode: "talent" })
    await expect(talentApi.project.list()).rejects.toMatchObject({ code: "FORBIDDEN" })

    const unprofiled = await newUser("project-unprofiled")
    const api = caller(unprofiled)
    await api.auth.enableMode({ mode: "booker" })
    await expect(api.project.create({ name: "Too early" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    })
  })

  it("requires languages from the languages table, not a loose attribute", async () => {
    const { api } = await newBooker("project-languages")
    const yoruba = await ensureLanguagesDefinition()
    const project = await api.project.create({ name: "Bank commercial — March" })
    const base = { projectId: project.id, ...noRoleExtras, name: "Lead actress, 25–30, Yoruba-speaking", brief }

    const created = await api.role.create({
      ...base,
      requirements: {
        languages: { anyOf: [yoruba] },
      },
    })
    expect(created.roles[0]?.requirements).toEqual({ languages: { anyOf: [yoruba] } })

    await expect(
      api.role.create({ ...base, requirements: { languages: { anyOf: ["klingon"] } } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("klingon") })

    const options = await api.role.formOptions()
    expect(options.attributes.find((a) => a.key === "languages")?.options).toContain(yoruba)

    // Talents set languages through their own list; the attribute setter refuses the key.
    const talent = await newUser("project-languages-talent")
    const talentApi = caller(talent)
    await talentApi.auth.enableMode({ mode: "talent" })
    await expect(
      talentApi.talent.attributes.set({ definitionKey: "languages", valueText: yoruba })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})
