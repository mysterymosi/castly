import { z } from "zod"

import { projectTypeSchema } from "./booker"

const MONEY_MAX = 9_999_999_999.99 // numeric(12, 2)

const nameSchema = z.string().trim().min(1).max(120)
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Blank or whitespace is not a brief: it becomes null, never an empty string (PRD §7.3.1). */
const briefSchema = z
  .string()
  .trim()
  .max(5000)
  .nullable()
  .transform((value) => (value ? value : null))

/**
 * One requirement per attribute definition key. The shape must suit the attribute's data type —
 * checked by the API against `attribute_definitions`: number → `{ min?, max? }`;
 * select / multi_select / text → `{ anyOf }` (select values must be listed options);
 * boolean → `{ equals }`.
 */
export const roleRequirementSchema = z.union([
  z
    .object({ min: z.number().optional(), max: z.number().optional() })
    .strict()
    .refine((r) => r.min !== undefined || r.max !== undefined, "Give a minimum or a maximum")
    .refine(
      (r) => r.min === undefined || r.max === undefined || r.min <= r.max,
      "Minimum must not exceed maximum",
    ),
  z.object({ anyOf: z.array(z.string().trim().min(1).max(80)).min(1).max(20) }).strict(),
  z.object({ equals: z.boolean() }).strict(),
])

export const roleRequirementsSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), roleRequirementSchema)
  .refine((r) => Object.keys(r).length <= 30, "At most 30 requirements")

const roleFieldsSchema = z
  .object({
    name: nameSchema,
    brief: briefSchema,
    categoryId: z.uuid().nullable(),
    shootStartsOn: isoDateSchema.nullable(),
    shootEndsOn: isoDateSchema.nullable(),
    rateMin: z.number().min(0).max(MONEY_MAX).nullable(),
    rateMax: z.number().min(0).max(MONEY_MAX).nullable(),
    requirements: roleRequirementsSchema.default({}),
  })
  .refine(
    (r) => r.shootStartsOn === null || r.shootEndsOn === null || r.shootEndsOn >= r.shootStartsOn,
    { message: "The shoot must end on or after it starts", path: ["shootEndsOn"] },
  )
  .refine((r) => r.rateMin === null || r.rateMax === null || r.rateMax >= r.rateMin, {
    message: "Maximum rate must not be below the minimum",
    path: ["rateMax"],
  })

export const roleSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  brief: z.string().nullable(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  shootStartsOn: z.string().nullable(),
  shootEndsOn: z.string().nullable(),
  rateMin: z.number().nullable(),
  rateMax: z.number().nullable(),
  rateCurrency: z.string(),
  requirements: z.record(z.string(), roleRequirementSchema),
  /** Always false until `role.publish` ships with the open-roles board (M7 + M9). */
  isPublished: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const projectStatusSchema = z.enum(["active", "archived"])

export const projectSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: projectTypeSchema.nullable(),
  status: projectStatusSchema,
  roleCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const projectDetailSchema = projectSummarySchema.extend({
  roles: z.array(roleSchema),
})

/** `project.list`: active projects by default, newest first. */
export const listProjectsInput = z
  .object({ includeArchived: z.boolean().default(false) })
  .default({ includeArchived: false })

export const projectListSchema = z.object({ projects: z.array(projectSummarySchema) })

export const projectIdInput = z.object({ projectId: z.uuid() })

export const createProjectInput = z.object({
  name: nameSchema,
  type: projectTypeSchema.nullable().default(null),
})

export const updateProjectInput = z.object({
  projectId: z.uuid(),
  name: nameSchema,
  type: projectTypeSchema.nullable(),
})

/** Creates a role. There is deliberately no `isPublished` field. */
export const createRoleInput = z.object({ projectId: z.uuid() }).and(roleFieldsSchema)

/** Full replace of a role's fields. There is deliberately no `isPublished` field. */
export const updateRoleInput = z.object({ roleId: z.uuid() }).and(roleFieldsSchema)

export const roleIdInput = z.object({ roleId: z.uuid() })

/** Choices for the role form: active categories and the attributes requirements may use. */
export const roleFormOptionsSchema = z.object({
  categories: z.array(z.object({ id: z.uuid(), slug: z.string(), name: z.string() })),
  attributes: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      dataType: z.enum(["text", "number", "boolean", "select", "multi_select"]),
      tier: z.enum(["standard", "sensitive"]),
      options: z.array(z.string()).nullable(),
    }),
  ),
})

export type RoleRequirement = z.infer<typeof roleRequirementSchema>
export type RoleRequirements = z.infer<typeof roleRequirementsSchema>
export type Role = z.infer<typeof roleSchema>
export type ProjectSummary = z.infer<typeof projectSummarySchema>
export type ProjectDetail = z.infer<typeof projectDetailSchema>
export type RoleFormOptions = z.infer<typeof roleFormOptionsSchema>
export type CreateRoleInput = z.input<typeof createRoleInput>
export type UpdateRoleInput = z.input<typeof updateRoleInput>
