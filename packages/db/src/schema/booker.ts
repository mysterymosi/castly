import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { primaryUuid, timestamptz } from "./columns.js"
import { users } from "./identity.js"
import { talentProfiles } from "./talent.js"
import { categories, cities } from "./taxonomy.js"

/** PRD §6.2 "what kind of work do you do?". Adding a value is `ALTER TYPE … ADD VALUE`. */
export const bookerVertical = pgEnum("booker_vertical", [
  "casting_director",
  "producer",
  "director",
  "brand_or_agency",
  "event_planner",
  "photographer",
  "content_creator",
  "other",
])

/** The work a project is for; also a booker's typical project types. */
export const projectType = pgEnum("project_type", [
  "film",
  "tv",
  "commercial",
  "music_video",
  "theatre",
  "campaign",
  "event",
  "photoshoot",
  "content",
  "other",
])

/** TECH_SPEC §5.8 `verifications.tier`. Bookers start at `phone`; M7 raises it. */
export const verificationTier = pgEnum("verification_tier", ["phone", "id", "professional"])

export const projectStatus = pgEnum("project_status", ["active", "archived"])

export const bookerProfiles = pgTable(
  "booker_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    vertical: bookerVertical("vertical").notNull(),
    companyName: text("company_name"),
    /** Corporate Affairs Commission registration number; verified in M7. */
    cacNumber: text("cac_number"),
    cityId: uuid("city_id").references(() => cities.id, { onDelete: "set null" }),
    typicalProjectTypes: projectType("typical_project_types")
      .array()
      .notNull()
      .default(sql`'{}'::project_type[]`),
    verificationTier: verificationTier("verification_tier").notNull().default("phone"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("booker_profiles_city_id_idx").on(table.cityId)],
)

export const projects = pgTable(
  "projects",
  {
    id: primaryUuid(),
    bookerId: uuid("booker_id")
      .notNull()
      .references(() => bookerProfiles.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: projectType("type"),
    status: projectStatus("status").notNull().default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Default list: a booker's active projects, newest first. Also covers the FK.
    index("projects_booker_status_created_idx").on(
      table.bookerId,
      table.status,
      table.createdAt.desc(),
    ),
    check("projects_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
)

export const roles = pgTable(
  "roles",
  {
    id: primaryUuid(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /**
     * The written brief. NULL when there is none — never empty or whitespace, so "has a brief"
     * (which M8 uses to allow sensitive filters) is simply `brief IS NOT NULL`.
     */
    brief: text("brief"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** Structured brief keyed by attribute definition keys; soft ranking weights (TECH_SPEC §5.5). */
    requirements: jsonb("requirements")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    shootStartsOn: date("shoot_starts_on", { mode: "string" }),
    shootEndsOn: date("shoot_ends_on", { mode: "string" }),
    rateMin: numeric("rate_min", { precision: 12, scale: 2 }),
    rateMax: numeric("rate_max", { precision: 12, scale: 2 }),
    rateCurrency: text("rate_currency").notNull().default("NGN"),
    /** Drives the open-roles board (M9). Stays false until `role.publish` ships (M7 + M9). */
    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamptz("published_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("roles_project_id_idx").on(table.projectId),
    index("roles_category_id_idx").on(table.categoryId),
    check("roles_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("roles_brief_not_blank", sql`${table.brief} IS NULL OR btrim(${table.brief}) <> ''`),
    check("roles_requirements_object", sql`jsonb_typeof(${table.requirements}) = 'object'`),
    check(
      "roles_shoot_window_order",
      sql`${table.shootStartsOn} IS NULL OR ${table.shootEndsOn} IS NULL OR ${table.shootEndsOn} >= ${table.shootStartsOn}`,
    ),
    check(
      "roles_rate_range",
      sql`(${table.rateMin} IS NULL OR ${table.rateMin} >= 0)
        AND (${table.rateMax} IS NULL OR ${table.rateMax} >= 0)
        AND (${table.rateMin} IS NULL OR ${table.rateMax} IS NULL OR ${table.rateMax} >= ${table.rateMin})`,
    ),
    check(
      "roles_published_at_matches",
      sql`${table.isPublished} = (${table.publishedAt} IS NOT NULL)`,
    ),
  ],
)

/**
 * One shortlist per role per booker, plus one general "Saved talent" list (`role_id` NULL).
 * NULLS NOT DISTINCT makes the general list unique too, so M5 can upsert on right-swipe.
 */
export const shortlists = pgTable(
  "shortlists",
  {
    id: primaryUuid(),
    bookerId: uuid("booker_id")
      .notNull()
      .references(() => bookerProfiles.userId, { onDelete: "cascade" }),
    // Cascade, not SET NULL: a nulled role_id would collide with the general list and block the delete.
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("shortlists_booker_role_key").on(table.bookerId, table.roleId).nullsNotDistinct(),
    index("shortlists_role_id_idx").on(table.roleId),
    check("shortlists_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
)

export const shortlistEntries = pgTable(
  "shortlist_entries",
  {
    shortlistId: uuid("shortlist_id")
      .notNull()
      .references(() => shortlists.id, { onDelete: "cascade" }),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    note: text("note"),
    /** Booker's manual order; NULL sorts after ranked entries, then by `added_at`. */
    rank: integer("rank"),
    addedAt: timestamptz("added_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.shortlistId, table.talentId] }),
    index("shortlist_entries_talent_id_idx").on(table.talentId),
  ],
)
