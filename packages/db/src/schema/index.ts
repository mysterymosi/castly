export * from "./identity.js"
export * from "./taxonomy.js"
export * from "./config.js"
export * from "./talent.js"
export * from "./media.js"
export * from "./search.js"
export * from "./booker.js"
export * from "./deck.js"

/**
 * Tables with RLS enabled and no policies (default-deny).
 * `anon` and `authenticated` have SELECT only, so a query returns zero rows.
 * Writes stay revoked. M6 may grant `authenticated` SELECT on chat tables.
 * The API connects as `castly_api`, which bypasses RLS.
 */
export const rlsTables = [
  "users",
  "user_modes",
  "device_tokens",
  "categories",
  "attribute_definitions",
  "skills",
  "languages",
  "accents",
  "cities",
  "feature_flags",
  "ranking_weights",
  "talent_profiles",
  "talent_categories",
  "talent_attributes",
  "talent_skills",
  "talent_languages",
  "talent_accents",
  "credits",
  "talent_rates",
  "talent_availability",
  "training",
  "affiliations",
  "press",
  "testimonials",
  "social_links",
  "portfolio_sections",
  "section_media",
  "media_assets",
  "media_upload_tokens",
  "media_moderation_jobs",
  "profile_delegates",
  "talent_search",
  "booker_profiles",
  "projects",
  "roles",
  "shortlists",
  "shortlist_entries",
  "vertical_category_weights",
  "deck_sessions",
  "deck_queue",
  "swipes",
  "deck_impressions",
  "talent_exposure_daily",
  "profile_views",
] as const
