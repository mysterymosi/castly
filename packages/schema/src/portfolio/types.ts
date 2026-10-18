/** Core studio section types for M2. */
export const corePortfolioSectionTypes = [
  "hero",
  "about",
  "gallery",
  "showreel",
  "credits",
  "attributes",
  "skills",
  "languages",
  "rates",
  "availability",
] as const

/** Stub section types — validate and persist; minimal renderers in M2. */
export const stubPortfolioSectionTypes = [
  "audio",
  "training",
  "affiliations",
  "press",
  "testimonials",
  "social",
  "custom",
] as const

export const portfolioSectionTypes = [
  ...corePortfolioSectionTypes,
  ...stubPortfolioSectionTypes,
] as const

export type PortfolioSectionType = (typeof portfolioSectionTypes)[number]

export type PortfolioSectionTypeMap = {
  [K in PortfolioSectionType]: K
}
