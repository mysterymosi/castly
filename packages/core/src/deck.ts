import type { RoleRequirement } from "@workspace/schema"

import { verticalCategoryMatch, type VerticalCategoryWeights } from "./vertical-category-match.js"

/**
 * The deck engine's pure stages (TECH_SPEC §7). Stage 1 (candidate SQL) and stage 4 (the queue
 * write) live in the API; stages 2 and 3 live here so they can be tested without a database.
 */

/** An attribute value as role matching reads it: a number, a flag, or one or more option slugs. */
export type AttributeValue = number | boolean | string | readonly string[]

/** A stage 1 row from `talent_search`, already in the session's seeded pre-order. */
export type DeckCandidate = {
  talentId: string
  categoryIds: readonly string[]
  cityId: string | null
  region: string | null
  country: string | null
  /** 0–100, from the `talent.search-scores` job. */
  qualityScore: number
  freshnessScore: number
  responsivenessScore: number
  /**
   * Values role requirements are matched against, by attribute key. A missing key is unknown,
   * never a mismatch. Never read without a role.
   */
  attributes: Readonly<Record<string, AttributeValue>>
  /** Raised a hand on the session's role (M9). */
  raisedHand: boolean
  /** Paid placement multiplier (M10); 0 when none. Capped in `boostContribution`. */
  boost: number
}

/**
 * Term weights from `ranking_weights`, plus the boost cap: the most a boost may add, as a
 * fraction of the highest organic score the weights allow (TECH_SPEC §7.2).
 */
export type RankingWeights = {
  vertical: number
  geo: number
  quality: number
  freshness: number
  responsiveness: number
  role: number
  raisedHand: number
  boostCapFraction: number
}

/** Used for any key `ranking_weights` doesn't set. Ordered as PRD §7.2.3 ranks the signals. */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  vertical: 1,
  geo: 0.6,
  quality: 0.8,
  freshness: 0.4,
  responsiveness: 0.2,
  role: 1,
  raisedHand: 0.3,
  boostCapFraction: 0.1,
}

/** `ranking_weights.key` for each weight. */
export const RANKING_WEIGHT_KEYS: Record<keyof RankingWeights, string> = {
  vertical: "w_vertical",
  geo: "w_geo",
  quality: "w_quality",
  freshness: "w_freshness",
  responsiveness: "w_responsiveness",
  role: "w_role",
  raisedHand: "w_raised_hand",
  boostCapFraction: "boost_cap_fraction",
}

/** A role requirement with its attribute's tier, so scoring can refuse sensitive ones. */
export type ScoringRequirement = {
  key: string
  tier: "standard" | "sensitive"
  requirement: RoleRequirement
}

export type ScoringContext = {
  weights: RankingWeights
  verticalWeights: VerticalCategoryWeights
  booker: { cityId: string | null; region: string | null; country: string | null }
  /** The session's role. Sensitive requirements count only when `briefed` (PRD §7.3.1). */
  role: { briefed: boolean; requirements: readonly ScoringRequirement[] } | null
}

export type ScoreTerm =
  | "vertical"
  | "geo"
  | "quality"
  | "freshness"
  | "responsiveness"
  | "role"
  | "raisedHand"
  | "boost"

/**
 * One "why this card" entry. Scoring appends one per term that added to the score; the card's
 * reason string (5.11) and the inspector (5.10) read them. `detail` names what matched — keys
 * and levels, never a talent's attribute values.
 */
export type DeckReason = {
  code: ScoreTerm
  contribution: number
  detail?: Record<string, string | readonly string[]>
}

export type ScoredCandidate = DeckCandidate & {
  score: number
  reasons: DeckReason[]
  /** Every term's weighted contribution, zeros included, for the inspector. */
  components: Record<ScoreTerm, number>
}

/** Same city 1, same region 0.6, same country 0.3, else 0 (PRD §7.2.3 item 2). */
export function geoProximity(
  talent: Pick<DeckCandidate, "cityId" | "region" | "country">,
  booker: ScoringContext["booker"],
): { value: number; level: "city" | "region" | "country" | null } {
  if (talent.cityId && talent.cityId === booker.cityId) return { value: 1, level: "city" }
  if (talent.region && talent.region === booker.region && talent.country === booker.country) {
    return { value: 0.6, level: "region" }
  }
  if (talent.country && talent.country === booker.country) return { value: 0.3, level: "country" }
  return { value: 0, level: null }
}

/** A requirement's value for an unknown attribute: neither a match nor a miss. */
export const UNKNOWN_MATCH = 0.5

/** How far outside a numeric range a value can sit before it scores 0, relative to the bound. */
const RANGE_TOLERANCE = 0.1

/** How well one value meets one requirement, 0–1. Never excludes: worst case is 0. */
export function requirementMatch(requirement: RoleRequirement, value: AttributeValue | undefined) {
  if (value === undefined) return UNKNOWN_MATCH
  if ("equals" in requirement) return value === requirement.equals ? 1 : 0
  if ("anyOf" in requirement) {
    const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : []
    return values.some((v) => requirement.anyOf.includes(v)) ? 1 : 0
  }
  if (typeof value !== "number") return UNKNOWN_MATCH
  const { min, max } = requirement
  const below = min !== undefined && value < min ? min - value : 0
  const above = max !== undefined && value > max ? value - max : 0
  const distance = below || above
  if (distance === 0) return 1
  const bound = below ? min! : max!
  const tolerance = Math.max(1, Math.abs(bound) * RANGE_TOLERANCE)
  return Math.max(0, 1 - distance / tolerance)
}

/**
 * `roleSoftMatch` (PRD §7.2.3): the mean match across the role's requirements, 0–1. A soft
 * weight only — a talent outside every requirement still scores, just lower. Sensitive
 * requirements are dropped unless the role is briefed. Returns the keys that fully matched.
 */
export function roleSoftMatch(
  attributes: DeckCandidate["attributes"],
  role: ScoringContext["role"],
): { value: number; matched: string[] } {
  const requirements = (role?.requirements ?? []).filter(
    (r) => r.tier === "standard" || role!.briefed,
  )
  if (requirements.length === 0) return { value: 0, matched: [] }
  let total = 0
  const matched: string[] = []
  for (const { key, requirement } of requirements) {
    const match = requirementMatch(requirement, attributes[key])
    total += match
    if (match === 1) matched.push(key)
  }
  return { value: total / requirements.length, matched }
}

/** The highest score the organic terms can reach under these weights (each term tops out at 1). */
export function maxOrganicScore(weights: RankingWeights, hasRole: boolean) {
  return (
    weights.vertical +
    weights.geo +
    weights.quality +
    weights.freshness +
    weights.responsiveness +
    (hasRole ? weights.role + weights.raisedHand : 0)
  )
}

/** A boost's contribution, capped at `boostCapFraction` of the maximum organic score. */
export function boostContribution(boost: number, weights: RankingWeights, hasRole: boolean) {
  if (!Number.isFinite(boost) || boost <= 0) return 0
  const cap = Math.max(0, weights.boostCapFraction) * maxOrganicScore(weights, hasRole)
  return Math.min(boost, cap)
}

const unit = (score: number) => (Number.isFinite(score) ? Math.min(1, Math.max(0, score / 100)) : 0)

/** One candidate's weighted terms and reasons. */
export function scoreCandidate(candidate: DeckCandidate, context: ScoringContext): ScoredCandidate {
  const { weights } = context
  const hasRole = context.role !== null
  const geo = geoProximity(candidate, context.booker)
  const role = roleSoftMatch(candidate.attributes, context.role)

  const components: Record<ScoreTerm, number> = {
    vertical: weights.vertical * verticalCategoryMatch(candidate.categoryIds, context.verticalWeights),
    geo: weights.geo * geo.value,
    quality: weights.quality * unit(candidate.qualityScore),
    freshness: weights.freshness * unit(candidate.freshnessScore),
    responsiveness: weights.responsiveness * unit(candidate.responsivenessScore),
    role: hasRole ? weights.role * role.value : 0,
    raisedHand: hasRole && candidate.raisedHand ? weights.raisedHand : 0,
    boost: boostContribution(candidate.boost, weights, hasRole),
  }

  const detail: Partial<Record<ScoreTerm, DeckReason["detail"]>> = {
    geo: geo.level ? { level: geo.level } : undefined,
    role: role.matched.length > 0 ? { matched: role.matched } : undefined,
  }
  const reasons: DeckReason[] = []
  for (const code of Object.keys(components) as ScoreTerm[]) {
    const contribution = components[code]
    if (contribution <= 0) continue
    reasons.push(detail[code] ? { code, contribution, detail: detail[code] } : { code, contribution })
  }

  const score = Object.values(components).reduce((sum, value) => sum + value, 0)
  return { ...candidate, score, reasons, components }
}

/**
 * Stage 2 (TECH_SPEC §7.2). Never removes a candidate: every input comes out scored. The sort is
 * stable, so tied candidates keep stage 1's seeded order — which keeps two sessions different.
 * Follower count is not an input; sensitive attributes reach the score only through a briefed
 * role's `roleSoftMatch`.
 */
export function scoreCandidates(
  candidates: readonly DeckCandidate[],
  context: ScoringContext,
): ScoredCandidate[] {
  return candidates.map((c) => scoreCandidate(c, context)).sort((a, b) => b.score - a.score)
}

/**
 * Stage 3, interim: the scored order unchanged. Exposure penalty, exploration injection and
 * diversity spacing land in M5 5.7.
 */
export function applyFairness(scored: readonly ScoredCandidate[]): ScoredCandidate[] {
  return [...scored]
}

/** Weights from `ranking_weights` rows over the defaults. Unknown keys and bad values are ignored. */
export function rankingWeightsFromRows(rows: readonly { key: string; value: number }[]): RankingWeights {
  const weights = { ...DEFAULT_RANKING_WEIGHTS }
  for (const name of Object.keys(RANKING_WEIGHT_KEYS) as (keyof RankingWeights)[]) {
    const row = rows.find((r) => r.key === RANKING_WEIGHT_KEYS[name])
    if (row && Number.isFinite(row.value) && row.value >= 0) weights[name] = row.value
  }
  return weights
}
