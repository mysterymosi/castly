export * from "./identity.js"
export * from "./taxonomy.js"
export * from "./config.js"

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
] as const
