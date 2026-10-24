import { sql } from "drizzle-orm"
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core"

import { timestamptz } from "./columns.js"
import { rateVisibility, talentProfileStatus, talentProfiles } from "./talent.js"

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector"
  },
})

/**
 * Denormalised search projection (TECH_SPEC §5.10). One row per talent profile.
 *
 * Projection columns are written only by `refresh_talent_search(talent_id)`, which the
 * source-table triggers call (migration 0007_talent_search_projection). Score columns are
 * written only by the `talent.search-scores` job. Never write either set from request code.
 *
 * `age_*`, `height_cm`, `gender`, `complexion`, and `attrs` stay empty until M8 adds the
 * tier-guarded attribute projection.
 */
export const talentSearch = pgTable(
  "talent_search",
  {
    talentId: uuid("talent_id")
      .primaryKey()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    status: talentProfileStatus("status").notNull(),
    cityId: uuid("city_id"),
    region: text("region"),
    country: text("country"),
    categoryIds: uuid("category_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    skillIds: uuid("skill_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    languageIds: uuid("language_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    accentIds: uuid("accent_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    ageMin: integer("age_min"),
    ageMax: integer("age_max"),
    heightCm: integer("height_cm"),
    gender: text("gender"),
    complexion: text("complexion"),
    /** Null when `rate_visibility = 'hidden'`; the query builder puts those talents in `onRequest`. */
    rateDayMin: numeric("rate_day_min", { precision: 12, scale: 2 }),
    rateDayMax: numeric("rate_day_max", { precision: 12, scale: 2 }),
    rateVisibility: rateVisibility("rate_visibility").notNull(),
    hasShowreel: boolean("has_showreel").notNull().default(false),
    creditCount: integer("credit_count").notNull().default(0),
    verificationTier: text("verification_tier").notNull().default("none"),
    qualityScore: numeric("quality_score", { precision: 5, scale: 2 }).notNull().default("0"),
    freshnessScore: numeric("freshness_score", { precision: 5, scale: 2 }).notNull().default("0"),
    responsivenessScore: numeric("responsiveness_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    completenessScore: numeric("completeness_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    attrs: jsonb("attrs").notNull().default(sql`'{}'::jsonb`),
    searchTsv: tsvector("search_tsv").notNull().default(sql`''::tsvector`),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("talent_search_category_ids_gin").using("gin", table.categoryIds),
    index("talent_search_skill_ids_gin").using("gin", table.skillIds),
    index("talent_search_language_ids_gin").using("gin", table.languageIds),
    index("talent_search_accent_ids_gin").using("gin", table.accentIds),
    index("talent_search_attrs_gin").using("gin", table.attrs),
    index("talent_search_tsv_gin").using("gin", table.searchTsv),
    index("talent_search_status_geo_idx").on(table.status, table.country, table.cityId),
    index("talent_search_live_idx")
      .on(table.cityId, table.qualityScore.desc())
      .where(sql`${table.status} = 'live'`),
  ],
)
