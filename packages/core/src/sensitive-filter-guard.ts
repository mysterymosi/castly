/** `attribute_definitions.tier` for a filterable attribute. `prohibited` never has a row. */
export type FilterAttributeTier = "standard" | "sensitive"

export type AttributeFilterCheck =
  | { ok: true; standard: string[]; sensitive: string[] }
  | { ok: false; reason: "unknown_attribute" | "sensitive_requires_brief"; keys: string[] }

/**
 * The one sensitive-attribute guard (TECH_SPEC §20.1, PRD §7.3.1), called by the query builder
 * before any filter reaches SQL. Sensitive keys need an active role with a written brief — the
 * declared purpose that makes them legitimate. Even then they only reach scoring as soft
 * preferences; this guard never turns one into an exclusion.
 *
 * `tiers` holds the active definitions; a key missing from it is unknown.
 */
export function checkAttributeFilters(
  keys: readonly string[],
  tiers: Readonly<Record<string, FilterAttributeTier>>,
  role: { brief: string | null } | null,
): AttributeFilterCheck {
  const unknown = keys.filter((key) => tiers[key] === undefined)
  if (unknown.length > 0) return { ok: false, reason: "unknown_attribute", keys: unknown }

  const sensitive = keys.filter((key) => tiers[key] === "sensitive")
  const briefed = Boolean(role?.brief?.trim())
  if (sensitive.length > 0 && !briefed) {
    return { ok: false, reason: "sensitive_requires_brief", keys: sensitive }
  }
  return { ok: true, standard: keys.filter((key) => tiers[key] === "standard"), sensitive }
}
