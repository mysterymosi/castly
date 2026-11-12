import type { CoreSectionType } from "@workspace/schema"

export const portfolioTemplateIds = ["editorial", "reel_first", "case_study"] as const
export type PortfolioTemplateId = (typeof portfolioTemplateIds)[number]

/** Block order applied in one step when a talent picks a template. */
export const portfolioTemplates: Record<PortfolioTemplateId, CoreSectionType[]> = {
  editorial: ["hero", "about", "skills", "credits", "attributes", "languages"],
  reel_first: ["showreel", "hero", "credits", "about", "skills", "rates"],
  case_study: ["credits", "about", "skills", "showreel", "availability"],
}
