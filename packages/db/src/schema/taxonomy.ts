import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { primaryUuid } from "./columns.js"

export const categoryKind = pgEnum("category_kind", [
  "on_camera",
  "crew",
  "production",
  "events",
])

export const attributeDataType = pgEnum("attribute_data_type", [
  "text",
  "number",
  "boolean",
  "select",
  "multi_select",
])

/** `prohibited` exists so the ban is explicit and testable. No row may use it. */
export const attributeTier = pgEnum("attribute_tier", ["standard", "sensitive", "prohibited"])

export const categories = pgTable(
  "categories",
  {
    id: primaryUuid(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull(),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [
    uniqueIndex("categories_slug_uidx").on(table.slug),
    index("categories_parent_id_idx").on(table.parentId),
  ],
)

export const attributeDefinitions = pgTable(
  "attribute_definitions",
  {
    id: primaryUuid(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    dataType: attributeDataType("data_type").notNull(),
    tier: attributeTier("tier").notNull(),
    appliesToCategoryIds: uuid("applies_to_category_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    options: jsonb("options").$type<string[] | null>(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("attribute_definitions_key_uidx").on(table.key),
    check("attribute_definitions_tier_not_prohibited", sql`${table.tier} <> 'prohibited'`),
  ],
)

export const skills = pgTable(
  "skills",
  {
    id: primaryUuid(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("skills_slug_uidx").on(table.slug)],
)

export const languages = pgTable(
  "languages",
  {
    id: primaryUuid(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("languages_slug_uidx").on(table.slug)],
)

export const accents = pgTable(
  "accents",
  {
    id: primaryUuid(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("accents_slug_uidx").on(table.slug)],
)

export const cities = pgTable(
  "cities",
  {
    id: primaryUuid(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** ISO 3166-1 alpha-2. Projected onto `talent_search` for geo scope. */
    country: text("country").notNull().default("NG"),
    region: text("region"),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("cities_slug_uidx").on(table.slug)],
)
