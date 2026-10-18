import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { primaryUuid, timestamptz } from "./columns.js"
import { users } from "./identity.js"
import {
  accents,
  attributeDefinitions,
  categories,
  cities,
  languages,
  skills,
} from "./taxonomy.js"

export const talentProfileStatus = pgEnum("talent_profile_status", [
  "draft",
  "live",
  "suspended",
])

export const rateVisibility = pgEnum("rate_visibility", [
  "public",
  "verified_bookers",
  "hidden",
])

export const skillProficiency = pgEnum("skill_proficiency", [
  "learning",
  "competent",
  "proficient",
  "expert",
])

export const languageFluency = pgEnum("language_fluency", [
  "basic",
  "conversational",
  "fluent",
  "native",
])

export const talentRateKind = pgEnum("talent_rate_kind", ["day", "half_day", "project"])

export const talentAvailabilityStatus = pgEnum("talent_availability_status", [
  "available",
  "partial",
  "booked",
])

export const mediaKind = pgEnum("media_kind", ["image", "video", "audio", "document"])

export const mediaProvider = pgEnum("media_provider", [
  "cf_images",
  "mux",
  "supabase",
])

export const mediaAssetStatus = pgEnum("media_asset_status", [
  "pending",
  "processing",
  "ready",
  "failed",
  "quarantined",
])

/** Talent-owned profile. `user_id` is the sole owner and cannot be reassigned (DB trigger). */
export const talentProfiles = pgTable(
  "talent_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    headline: text("headline"),
    bio: text("bio"),
    cityId: uuid("city_id").references(() => cities.id, { onDelete: "set null" }),
    willingToTravel: boolean("willing_to_travel").notNull().default(false),
    openToRelocate: boolean("open_to_relocate").notNull().default(false),
    status: talentProfileStatus("status").notNull().default("draft"),
    publishedAt: timestamptz("published_at"),
    completenessScore: numeric("completeness_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    qualityScore: numeric("quality_score", { precision: 5, scale: 2 }).notNull().default("0"),
    responsivenessScore: numeric("responsiveness_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    rateVisibility: rateVisibility("rate_visibility").notNull().default("public"),
    cardConfig: jsonb("card_config")
      .notNull()
      .default(sql`'{"leadMediaId":null,"highlightFacts":[]}'::jsonb`),
    quickStartCompletedAt: timestamptz("quick_start_completed_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("talent_profiles_slug_uidx").on(table.slug)],
)

export const talentCategories = pgTable(
  "talent_categories",
  {
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.talentId, table.categoryId] }),
    index("talent_categories_category_id_idx").on(table.categoryId),
  ],
)

export const talentAttributes = pgTable(
  "talent_attributes",
  {
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: "cascade" }),
    valueText: text("value_text"),
    valueNum: numeric("value_num"),
    valueBool: boolean("value_bool"),
    isVisible: boolean("is_visible").notNull().default(true),
  },
  (table) => [
    primaryKey({ columns: [table.talentId, table.definitionId] }),
    index("talent_attributes_definition_id_idx").on(table.definitionId),
  ],
)

export const talentSkills = pgTable(
  "talent_skills",
  {
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    proficiency: skillProficiency("proficiency").notNull().default("competent"),
  },
  (table) => [
    primaryKey({ columns: [table.talentId, table.skillId] }),
    index("talent_skills_skill_id_idx").on(table.skillId),
  ],
)

export const talentLanguages = pgTable(
  "talent_languages",
  {
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "cascade" }),
    fluency: languageFluency("fluency").notNull().default("conversational"),
  },
  (table) => [
    primaryKey({ columns: [table.talentId, table.languageId] }),
    index("talent_languages_language_id_idx").on(table.languageId),
  ],
)

export const talentAccents = pgTable(
  "talent_accents",
  {
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    accentId: uuid("accent_id")
      .notNull()
      .references(() => accents.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.talentId, table.accentId] }),
    index("talent_accents_accent_id_idx").on(table.accentId),
  ],
)

export const credits = pgTable(
  "credits",
  {
    id: primaryUuid(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    roleName: text("role_name"),
    productionCompany: text("production_company"),
    year: integer("year"),
    type: text("type"),
    link: text("link"),
    isSignature: boolean("is_signature").notNull().default(false),
    verifiedAt: timestamptz("verified_at"),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [index("credits_talent_id_idx").on(table.talentId)],
)

export const talentRates = pgTable(
  "talent_rates",
  {
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    kind: talentRateKind("kind").notNull(),
    amountMin: numeric("amount_min", { precision: 12, scale: 2 }),
    amountMax: numeric("amount_max", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("NGN"),
    negotiable: boolean("negotiable").notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.talentId, table.kind] })],
)

export const talentAvailability = pgTable(
  "talent_availability",
  {
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    month: text("month").notNull(),
    status: talentAvailabilityStatus("status").notNull().default("available"),
  },
  (table) => [primaryKey({ columns: [table.talentId, table.month] })],
)

export const training = pgTable(
  "training",
  {
    id: primaryUuid(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    institution: text("institution").notNull(),
    program: text("program"),
    year: integer("year"),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [index("training_talent_id_idx").on(table.talentId)],
)

export const affiliations = pgTable(
  "affiliations",
  {
    id: primaryUuid(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    roleTitle: text("role_title"),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [index("affiliations_talent_id_idx").on(table.talentId)],
)

export const press = pgTable(
  "press",
  {
    id: primaryUuid(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    outlet: text("outlet").notNull(),
    headline: text("headline"),
    url: text("url"),
    publishedAt: timestamptz("published_at"),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [index("press_talent_id_idx").on(table.talentId)],
)

export const testimonials = pgTable(
  "testimonials",
  {
    id: primaryUuid(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    authorTitle: text("author_title"),
    body: text("body").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [index("testimonials_talent_id_idx").on(table.talentId)],
)

export const socialLinks = pgTable(
  "social_links",
  {
    id: primaryUuid(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    url: text("url").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [
    index("social_links_talent_id_idx").on(table.talentId),
    uniqueIndex("social_links_talent_platform_uidx").on(table.talentId, table.platform),
  ],
)

export const portfolioSections = pgTable(
  "portfolio_sections",
  {
    id: primaryUuid(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    type: text("type").notNull(),
    position: integer("position").notNull().default(0),
    isVisible: boolean("is_visible").notNull().default(true),
    schemaVersion: integer("schema_version").notNull().default(1),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("portfolio_sections_talent_id_idx").on(table.talentId),
    index("portfolio_sections_talent_position_idx").on(table.talentId, table.position),
  ],
)

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: primaryUuid(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: mediaKind("kind").notNull(),
    provider: mediaProvider("provider").notNull(),
    providerRef: text("provider_ref"),
    status: mediaAssetStatus("status").notNull().default("pending"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    posterUrl: text("poster_url"),
    blurhash: text("blurhash"),
    moderationStatus: text("moderation_status"),
    moderationPayload: jsonb("moderation_payload"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("media_assets_owner_id_idx").on(table.ownerId)],
)

export const sectionMedia = pgTable(
  "section_media",
  {
    sectionId: uuid("section_id")
      .notNull()
      .references(() => portfolioSections.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    caption: text("caption"),
  },
  (table) => [
    primaryKey({ columns: [table.sectionId, table.mediaId] }),
    index("section_media_media_id_idx").on(table.mediaId),
  ],
)

/** Agency may act on a profile the talent owns; the talent remains the owner (see talent_profiles.user_id). */
export const profileDelegates = pgTable(
  "profile_delegates",
  {
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talentProfiles.userId, { onDelete: "cascade" }),
    delegateUserId: uuid("delegate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedAt: timestamptz("granted_at").notNull().defaultNow(),
    revokedAt: timestamptz("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.talentId, table.delegateUserId] }),
    check(
      "profile_delegates_not_self",
      sql`${table.delegateUserId} <> ${table.talentId}`,
    ),
    index("profile_delegates_delegate_user_id_idx").on(table.delegateUserId),
  ],
)
