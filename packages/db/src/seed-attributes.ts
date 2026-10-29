import type { attributeDefinitions } from "./schema/index.js"

type Definition = Omit<
  typeof attributeDefinitions.$inferInsert,
  "id" | "appliesToCategoryIds" | "active"
> & {
  tier: "standard" | "sensitive"
  /** Resolved to category ids by the seed. */
  appliesTo: "on_camera" | "all"
}

/**
 * Launch attribute taxonomy, tiered per PRD §7.3.1 (a starting proposal pending legal and
 * casting-director review). Prohibited attributes — religion, health, disability, marital status,
 * sexual orientation, pregnancy, HIV status — are not collected at all and never appear here.
 *
 * Seeding is insert-only by key, so ops edits to a definition survive re-seeding.
 */
export const launchAttributeDefinitions: Definition[] = [
  // Standard: freely filterable routine casting data.
  { key: "height_cm", label: "Height (cm)", dataType: "number", tier: "standard", appliesTo: "on_camera" },
  {
    key: "hair",
    label: "Hair",
    dataType: "select",
    tier: "standard",
    appliesTo: "on_camera",
    options: ["black", "brown", "blonde", "coloured", "bald"],
  },
  {
    key: "eye_colour",
    label: "Eye colour",
    dataType: "select",
    tier: "standard",
    appliesTo: "on_camera",
    options: ["dark_brown", "brown", "hazel", "green", "blue", "grey"],
  },
  { key: "visible_tattoos", label: "Visible tattoos", dataType: "boolean", tier: "standard", appliesTo: "on_camera" },
  { key: "visible_piercings", label: "Visible piercings", dataType: "boolean", tier: "standard", appliesTo: "on_camera" },
  /**
   * Age range playable is two numbers, so a role's "25–30" is the overlap
   * `playing_age_min <= 30 AND playing_age_max >= 25` using ordinary range requirements.
   */
  { key: "playing_age_min", label: "Playing age from", dataType: "number", tier: "standard", appliesTo: "on_camera" },
  { key: "playing_age_max", label: "Playing age to", dataType: "number", tier: "standard", appliesTo: "on_camera" },
  { key: "dress_size", label: "Dress size", dataType: "text", tier: "standard", appliesTo: "on_camera" },
  { key: "shoe_size_eu", label: "Shoe size (EU)", dataType: "number", tier: "standard", appliesTo: "on_camera" },
  {
    key: "experience_years",
    label: "Years of experience",
    dataType: "number",
    tier: "standard",
    appliesTo: "all",
  },
  // Taxonomy-backed (`taxonomyAttributeKeys` in @workspace/schema — a test keeps them in sync):
  // values live in `talent_languages` / `talent_accents`, options in the `languages` / `accents`
  // tables. Defined here so role requirements can name them.
  {
    key: "languages",
    label: "Languages",
    dataType: "multi_select",
    tier: "standard",
    appliesTo: "all",
  },
  {
    key: "accents",
    label: "Accents",
    dataType: "multi_select",
    tier: "standard",
    appliesTo: "on_camera",
  },

  // Sensitive: usable only on a role with a written brief; self-declared and optional; never in
  // general ranking, completeness, or aggregate analytics.
  {
    key: "ethnicity",
    label: "Ethnicity",
    dataType: "select",
    tier: "sensitive",
    appliesTo: "on_camera",
    options: ["black", "white", "mixed", "other", "prefer_not_to_say"],
  },
  {
    key: "complexion",
    label: "Complexion",
    dataType: "select",
    tier: "sensitive",
    appliesTo: "on_camera",
    // PRD §7.3.1 neutral set — no ranked scale. "Any" is a booker choice, not a talent value.
    options: ["light", "medium", "deep"],
  },
  {
    key: "gender",
    label: "Gender",
    dataType: "select",
    tier: "sensitive",
    appliesTo: "on_camera",
    options: ["female", "male", "non_binary"],
  },
  { key: "bust_chest_cm", label: "Bust / chest (cm)", dataType: "number", tier: "sensitive", appliesTo: "on_camera" },
  { key: "waist_cm", label: "Waist (cm)", dataType: "number", tier: "sensitive", appliesTo: "on_camera" },
  { key: "hips_cm", label: "Hips (cm)", dataType: "number", tier: "sensitive", appliesTo: "on_camera" },
]
