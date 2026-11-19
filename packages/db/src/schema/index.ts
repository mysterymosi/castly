export * from "./identity.js"
export * from "./taxonomy.js"
export * from "./config.js"
export * from "./talent.js"
export * from "./media.js"
export * from "./search.js"
export * from "./booker.js"
export * from "./deck.js"
export * from "./interest.js"
export * from "./conversation.js"
export * from "./notification.js"
export * from "./safety.js"

/**
 * Tables with RLS enabled and no policies (default-deny).
 * `anon` and `authenticated` have SELECT only, so a query returns zero rows.
 * Writes stay revoked. The API connects as `castly_api`, which bypasses RLS.
 *
 * Not listed, because they carry policies (0019): `messages` (a participant reads their own
 * conversation's undeleted messages) and `conversation_participants` (a user reads their own
 * rows). `authenticated` has SELECT on those two and nothing else; `anon` has no access to them.
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
  "interests",
  "matches",
  "conversations",
  "notification_prefs",
  "push_notifications",
  "blocks",
] as const
