/** Ranking, scoring, fairness, and eligibility land with the deck (M5). */
export function identity<T>(value: T): T {
  return value
}

export {
  boostContribution,
  DEFAULT_RANKING_WEIGHTS,
  geoProximity,
  maxOrganicScore,
  RANKING_WEIGHT_KEYS,
  rankingWeightsFromRows,
  requirementMatch,
  roleSoftMatch,
  scoreCandidate,
  scoreCandidates,
  UNKNOWN_MATCH,
  type AttributeValue,
  type DeckCandidate,
  type DeckReason,
  type RankingWeights,
  type ScoredCandidate,
  type ScoreTerm,
  type ScoringContext,
  type ScoringRequirement,
} from "./deck.js"
export {
  applyExposurePenalty,
  applyFairness,
  DEFAULT_FAIRNESS_CONFIG,
  drawExplorers,
  explorationEligible,
  FAIRNESS_CONFIG_KEYS,
  fairnessConfigFromRows,
  injectExploration,
  isExplorationSlot,
  spaceForDiversity,
  type FairCandidate,
  type FairnessConfig,
  type FairnessContext,
} from "./fairness.js"
export { computeCompleteness, type CompletenessInput, type CompletenessResult } from "./completeness.js"
export { computeFreshnessScore, type FreshnessScoreInput } from "./freshness-score.js"
export {
  computeQualityScore,
  type QualityScoreInput,
  type VerificationTier,
} from "./quality-score.js"
export {
  serializeTalent,
  TalentOwnershipMismatch,
  type OwnerViewer,
  type SerializeTalentContext,
  type TalentAttributeRow,
  type TalentRecord,
  type TalentRateVisibility,
  type TalentViewer,
} from "./serialize-talent.js"
export { portfolioTemplates, portfolioTemplateIds, type PortfolioTemplateId } from "./portfolio-templates.js"
export { releaseFromEnv } from "./release.js"
export {
  checkAttributeFilters,
  type AttributeFilterCheck,
  type FilterAttributeTier,
} from "./sensitive-filter-guard.js"
export { verticalCategoryMatch, type VerticalCategoryWeights } from "./vertical-category-match.js"
