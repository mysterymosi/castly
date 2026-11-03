import { DEFAULT_RANKING_WEIGHTS, RANKING_WEIGHT_KEYS, type RankingWeights } from "./deck.js"
import { DEFAULT_FAIRNESS_CONFIG, FAIRNESS_CONFIG_KEYS, type FairnessConfig } from "./fairness.js"

/**
 * What a setting measures, which fixes its valid range: a weight is any non-negative number, a
 * fraction is 0–1, a count is a whole number of cards, at least 1. Never looser than what
 * `rankingWeightsFromRows` and `fairnessConfigFromRows` accept, so a saved value is always used.
 */
export type RankingSettingKind = "weight" | "fraction" | "count"

export type RankingSetting = {
  /** `ranking_weights.key`. */
  key: string
  group: "scoring" | "fairness"
  label: string
  description: string
  kind: RankingSettingKind
  defaultValue: number
}

const scoring: Record<keyof RankingWeights, Omit<RankingSetting, "key" | "group" | "defaultValue">> = {
  vertical: { label: "Vertical match", description: "Category fit for the booker's vertical (PRD §7.2.3 item 1).", kind: "weight" },
  geo: { label: "Location", description: "Same city 1, region 0.6, country 0.3.", kind: "weight" },
  quality: { label: "Profile quality", description: "The talent's quality score, 0–1.", kind: "weight" },
  freshness: { label: "Freshness", description: "Recently active or updated talent.", kind: "weight" },
  responsiveness: { label: "Responsiveness", description: "How reliably the talent replies.", kind: "weight" },
  role: { label: "Role match", description: "Soft match on the active role's requirements. Zero without a role.", kind: "weight" },
  raisedHand: { label: "Raised hand", description: "Talent who raised a hand for the role. Zero without a role.", kind: "weight" },
  boostCapFraction: {
    label: "Boost cap",
    description: "Most a paid boost can add, as a share of the best organic score.",
    kind: "fraction",
  },
}

const fairness: Record<keyof FairnessConfig, Omit<RankingSetting, "key" | "group" | "defaultValue">> = {
  exposurePercentile: {
    label: "Exposure percentile",
    description: "7-day impressions above this platform percentile are penalised.",
    kind: "fraction",
  },
  exposureMinImpressions: {
    label: "Exposure floor",
    description: "The penalty threshold is never below this many 7-day impressions.",
    kind: "weight",
  },
  exposurePenaltyStrength: {
    label: "Penalty strength",
    description: "How fast the penalty grows past the threshold.",
    kind: "weight",
  },
  exposurePenaltyMax: { label: "Penalty max", description: "Largest share of a score the penalty can take.", kind: "fraction" },
  explorationFraction: { label: "Exploration share", description: "Share of slots offered to under-seen talent.", kind: "fraction" },
  explorationDecile: {
    label: "Exploration pool",
    description: "Under-seen means in this lowest share by lifetime impressions.",
    kind: "fraction",
  },
  diversityMaxRun: { label: "Max run", description: "Most cards in a row from one category or agency.", kind: "count" },
  diversityWindow: { label: "Diversity window", description: "Cards from the top that spacing applies to.", kind: "count" },
}

/** Every tunable deck setting, scoring first, in display order. */
export const RANKING_SETTINGS: readonly RankingSetting[] = [
  ...(Object.keys(scoring) as (keyof RankingWeights)[]).map((name) => ({
    key: RANKING_WEIGHT_KEYS[name],
    group: "scoring" as const,
    defaultValue: DEFAULT_RANKING_WEIGHTS[name],
    ...scoring[name],
  })),
  ...(Object.keys(fairness) as (keyof FairnessConfig)[]).map((name) => ({
    key: FAIRNESS_CONFIG_KEYS[name],
    group: "fairness" as const,
    defaultValue: DEFAULT_FAIRNESS_CONFIG[name],
    ...fairness[name],
  })),
]

/** Why `value` can't be stored for `key`, or null when it can. */
export function rankingSettingProblem(key: string, value: number): string | null {
  const setting = RANKING_SETTINGS.find((s) => s.key === key)
  if (!setting) return `Unknown setting ${key}`
  if (!Number.isFinite(value) || value < 0) return `${setting.label} must be a number, 0 or more`
  if (setting.kind === "fraction" && value > 1) return `${setting.label} must be between 0 and 1`
  if (setting.kind === "count" && (value < 1 || !Number.isInteger(value))) {
    return `${setting.label} must be a whole number, 1 or more`
  }
  return null
}
