/**
 * Attribute keys whose talent values live in their own taxonomy tables rather than in
 * `talent_attributes`: `talent_languages` / `languages` and `talent_accents` / `accents`. They have
 * `attribute_definitions` rows so role requirements can name them, but talents set them through
 * their own lists, and requirement values are checked against those tables' slugs.
 */
export const taxonomyAttributeKeys = {
  languages: "languages",
  accents: "accents",
} as const

export type TaxonomyAttributeKey = (typeof taxonomyAttributeKeys)[keyof typeof taxonomyAttributeKeys]

export function isTaxonomyAttributeKey(key: string): key is TaxonomyAttributeKey {
  return Object.values<string>(taxonomyAttributeKeys).includes(key)
}
