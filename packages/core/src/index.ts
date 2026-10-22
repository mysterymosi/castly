/** Ranking, scoring, fairness, and eligibility land with the deck (M5). */
export function identity<T>(value: T): T {
  return value
}

export { computeCompleteness, type CompletenessInput, type CompletenessResult } from "./completeness.js"
export {
  computeQualityScore,
  type QualityScoreInput,
  type VerificationTier,
} from "./quality-score.js"
export { portfolioTemplates, portfolioTemplateIds, type PortfolioTemplateId } from "./portfolio-templates.js"
export { releaseFromEnv } from "./release.js"
