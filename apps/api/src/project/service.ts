import type { Db } from "@workspace/db"
import { schema } from "@workspace/db"
import type {
  createProjectInput,
  createRoleInput,
  ProjectDetail,
  ProjectSummary,
  Role,
  RoleFormOptions,
  RoleRequirement,
  RoleRequirements,
  updateProjectInput,
  updateRoleInput,
} from "@workspace/schema"
import { and, asc, count, desc, eq, inArray } from "drizzle-orm"
import type { z } from "zod"

import { ProjectError } from "./errors.js"

type ProjectRow = typeof schema.projects.$inferSelect
type RoleFields = Omit<z.output<typeof createRoleInput>, "projectId">

function toSummary(row: ProjectRow, roleCount: number): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    roleCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** The booker's own project. Someone else's project is indistinguishable from a missing one. */
async function ownedProject(db: Db, bookerId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.bookerId, bookerId)))
    .limit(1)
  if (!row) throw new ProjectError("Project not found", "project_not_found")
  return row
}

function assertEditable(project: ProjectRow) {
  if (project.status === "archived") {
    throw new ProjectError("Archived projects are read-only", "project_archived")
  }
}

async function loadRoles(db: Db, projectId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: schema.roles, categoryName: schema.categories.name })
    .from(schema.roles)
    .leftJoin(schema.categories, eq(schema.roles.categoryId, schema.categories.id))
    .where(eq(schema.roles.projectId, projectId))
    .orderBy(asc(schema.roles.createdAt))
  return rows.map(({ role, categoryName }) => ({
    id: role.id,
    projectId: role.projectId,
    name: role.name,
    brief: role.brief,
    categoryId: role.categoryId,
    categoryName,
    shootStartsOn: role.shootStartsOn,
    shootEndsOn: role.shootEndsOn,
    rateMin: role.rateMin === null ? null : Number(role.rateMin),
    rateMax: role.rateMax === null ? null : Number(role.rateMax),
    rateCurrency: role.rateCurrency,
    requirements: role.requirements as RoleRequirements,
    isPublished: role.isPublished,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  }))
}

async function detail(db: Db, project: ProjectRow): Promise<ProjectDetail> {
  const roles = await loadRoles(db, project.id)
  return { ...toSummary(project, roles.length), roles }
}

/** Active projects by default, newest first, with how many roles each has. */
export async function listProjects(
  db: Db,
  bookerId: string,
  includeArchived: boolean,
): Promise<ProjectSummary[]> {
  const rows = await db
    .select({ project: schema.projects, roleCount: count(schema.roles.id) })
    .from(schema.projects)
    .leftJoin(schema.roles, eq(schema.roles.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.projects.bookerId, bookerId),
        includeArchived ? undefined : eq(schema.projects.status, "active"),
      ),
    )
    .groupBy(schema.projects.id)
    .orderBy(desc(schema.projects.createdAt))
  return rows.map((row) => toSummary(row.project, row.roleCount))
}

export async function getProject(db: Db, bookerId: string, projectId: string) {
  return detail(db, await ownedProject(db, bookerId, projectId))
}

export async function createProject(
  db: Db,
  bookerId: string,
  input: z.output<typeof createProjectInput>,
): Promise<ProjectDetail> {
  const [profile] = await db
    .select({ userId: schema.bookerProfiles.userId })
    .from(schema.bookerProfiles)
    .where(eq(schema.bookerProfiles.userId, bookerId))
    .limit(1)
  if (!profile) {
    throw new ProjectError("Finish your booker profile first", "booker_profile_required")
  }
  const [row] = await db
    .insert(schema.projects)
    .values({ bookerId, name: input.name, type: input.type })
    .returning()
  return detail(db, row!)
}

export async function updateProject(
  db: Db,
  bookerId: string,
  input: z.output<typeof updateProjectInput>,
): Promise<ProjectDetail> {
  assertEditable(await ownedProject(db, bookerId, input.projectId))
  const [row] = await db
    .update(schema.projects)
    .set({ name: input.name, type: input.type, updatedAt: new Date() })
    .where(eq(schema.projects.id, input.projectId))
    .returning()
  return detail(db, row!)
}

/** Idempotent. Archived projects drop out of the default list and become read-only. */
export async function archiveProject(
  db: Db,
  bookerId: string,
  projectId: string,
): Promise<ProjectDetail> {
  const project = await ownedProject(db, bookerId, projectId)
  if (project.status === "archived") return detail(db, project)
  const [row] = await db
    .update(schema.projects)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId))
    .returning()
  return detail(db, row!)
}

function requirementShapeError(
  key: string,
  dataType: string,
  requirement: RoleRequirement,
  options: string[] | null,
): string | null {
  switch (dataType) {
    case "number":
      return "min" in requirement || "max" in requirement
        ? null
        : `"${key}" takes a range ({ min, max })`
    case "boolean":
      return "equals" in requirement ? null : `"${key}" takes { equals: true | false }`
    case "select":
    case "multi_select": {
      if (!("anyOf" in requirement)) return `"${key}" takes { anyOf: [...] }`
      const unknown = options ? requirement.anyOf.filter((v) => !options.includes(v)) : []
      return unknown.length > 0 ? `"${key}" has no option ${unknown.join(", ")}` : null
    }
    default:
      return "anyOf" in requirement ? null : `"${key}" takes { anyOf: [...] }`
  }
}

/**
 * Requirements are keyed by active attribute definitions and shaped by their data type. A
 * sensitive-tier attribute is only accepted on a role with a written brief (PRD §7.3.1): the
 * brief is the declared purpose that makes the sensitive requirement legitimate.
 */
async function validateRequirements(db: Db, requirements: RoleRequirements, brief: string | null) {
  const keys = Object.keys(requirements)
  if (keys.length === 0) return
  const definitions = await db
    .select({
      key: schema.attributeDefinitions.key,
      dataType: schema.attributeDefinitions.dataType,
      tier: schema.attributeDefinitions.tier,
      options: schema.attributeDefinitions.options,
    })
    .from(schema.attributeDefinitions)
    .where(
      and(
        inArray(schema.attributeDefinitions.key, keys),
        eq(schema.attributeDefinitions.active, true),
      ),
    )
  const byKey = new Map(definitions.map((d) => [d.key, d]))
  for (const key of keys) {
    const definition = byKey.get(key)
    if (!definition) throw new ProjectError(`Unknown attribute "${key}"`, "invalid_requirement")
    const problem = requirementShapeError(key, definition.dataType, requirements[key]!, definition.options)
    if (problem) throw new ProjectError(problem, "invalid_requirement")
    if (definition.tier !== "standard" && brief === null) {
      throw new ProjectError(
        `"${key}" is a sensitive attribute: write a brief for this role before requiring it`,
        "sensitive_requires_brief",
      )
    }
  }
}

async function assertCategory(db: Db, categoryId: string | null) {
  if (categoryId === null) return
  const [category] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.active, true)))
    .limit(1)
  if (!category) throw new ProjectError("Choose a category from the list", "unknown_category")
}

function roleValues(fields: RoleFields) {
  return {
    name: fields.name,
    brief: fields.brief,
    categoryId: fields.categoryId,
    shootStartsOn: fields.shootStartsOn,
    shootEndsOn: fields.shootEndsOn,
    rateMin: fields.rateMin === null ? null : String(fields.rateMin),
    rateMax: fields.rateMax === null ? null : String(fields.rateMax),
    requirements: fields.requirements,
  }
}

export async function createRole(
  db: Db,
  bookerId: string,
  input: z.output<typeof createRoleInput>,
): Promise<ProjectDetail> {
  const project = await ownedProject(db, bookerId, input.projectId)
  assertEditable(project)
  await assertCategory(db, input.categoryId)
  await validateRequirements(db, input.requirements, input.brief)
  await db.insert(schema.roles).values({ projectId: project.id, ...roleValues(input) })
  return detail(db, project)
}

export async function updateRole(
  db: Db,
  bookerId: string,
  input: z.output<typeof updateRoleInput>,
): Promise<ProjectDetail> {
  const [owned] = await db
    .select({ project: schema.projects })
    .from(schema.roles)
    .innerJoin(schema.projects, eq(schema.roles.projectId, schema.projects.id))
    .where(and(eq(schema.roles.id, input.roleId), eq(schema.projects.bookerId, bookerId)))
    .limit(1)
  if (!owned) throw new ProjectError("Role not found", "role_not_found")
  assertEditable(owned.project)
  await assertCategory(db, input.categoryId)
  await validateRequirements(db, input.requirements, input.brief)
  await db
    .update(schema.roles)
    .set({ ...roleValues(input), updatedAt: new Date() })
    .where(eq(schema.roles.id, input.roleId))
  return detail(db, owned.project)
}

/** Choices for the role form: active categories and active attributes requirements may use. */
export async function roleFormOptions(db: Db): Promise<RoleFormOptions> {
  const categories = await db
    .select({ id: schema.categories.id, slug: schema.categories.slug, name: schema.categories.name })
    .from(schema.categories)
    .where(eq(schema.categories.active, true))
    .orderBy(asc(schema.categories.sort), asc(schema.categories.name))
  const attributes = await db
    .select({
      key: schema.attributeDefinitions.key,
      label: schema.attributeDefinitions.label,
      dataType: schema.attributeDefinitions.dataType,
      tier: schema.attributeDefinitions.tier,
      options: schema.attributeDefinitions.options,
    })
    .from(schema.attributeDefinitions)
    .where(eq(schema.attributeDefinitions.active, true))
    .orderBy(asc(schema.attributeDefinitions.label))
  return {
    categories,
    attributes: attributes.flatMap((a) =>
      a.tier === "prohibited" ? [] : [{ ...a, tier: a.tier, options: a.options ?? null }],
    ),
  }
}
