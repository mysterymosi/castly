import type { DeckReason, ScoredCandidate } from "./deck.js"

/**
 * Stage 3 (TECH_SPEC §7.3): exposure penalty, exploration injection, diversity spacing — the
 * part of the deck that keeps the supply side alive. Never removes a card: the output is always
 * a reordering of the input.
 */

export type FairnessConfig = {
  /** Talents above this percentile of platform-wide 7-day impressions are penalised. */
  exposurePercentile: number
  /** The penalty never starts below this many 7-day impressions, so a quiet week penalises nobody. */
  exposureMinImpressions: number
  /** Score cut per multiple of the threshold above it: 0.25 cuts a talent seen twice as often by a quarter. */
  exposurePenaltyStrength: number
  /** The largest share of a score the penalty may take. */
  exposurePenaltyMax: number
  /** Share of slots reserved for under-seen talents. */
  explorationFraction: number
  /** The under-seen pool: this lowest share of candidates by lifetime impressions. */
  explorationDecile: number
  /** Most consecutive cards that may share a category, a city or an agency. */
  diversityMaxRun: number
  /** How far ahead spacing may reach for a card that breaks a run. */
  diversityWindow: number
}

export const DEFAULT_FAIRNESS_CONFIG: FairnessConfig = {
  exposurePercentile: 0.9,
  exposureMinImpressions: 20,
  exposurePenaltyStrength: 0.25,
  exposurePenaltyMax: 0.25,
  explorationFraction: 0.2,
  explorationDecile: 0.1,
  diversityMaxRun: 3,
  diversityWindow: 20,
}

/** `ranking_weights.key` for each setting. */
export const FAIRNESS_CONFIG_KEYS: Record<keyof FairnessConfig, string> = {
  exposurePercentile: "exposure_percentile",
  exposureMinImpressions: "exposure_min_impressions",
  exposurePenaltyStrength: "exposure_penalty_strength",
  exposurePenaltyMax: "exposure_penalty_max",
  explorationFraction: "exploration_fraction",
  explorationDecile: "exploration_decile",
  diversityMaxRun: "diversity_max_run",
  diversityWindow: "diversity_window",
}

/** Settings that are shares of something, so they must stay within 0–1. */
const FRACTIONS = new Set<keyof FairnessConfig>([
  "exposurePercentile",
  "exposurePenaltyMax",
  "explorationFraction",
  "explorationDecile",
])

/** Settings counted in whole cards, at least 1. */
const COUNTS = new Set<keyof FairnessConfig>(["diversityMaxRun", "diversityWindow"])

/** Config from `ranking_weights` rows over the defaults. Out-of-range values are ignored. */
export function fairnessConfigFromRows(rows: readonly { key: string; value: number }[]): FairnessConfig {
  const config = { ...DEFAULT_FAIRNESS_CONFIG }
  for (const name of Object.keys(FAIRNESS_CONFIG_KEYS) as (keyof FairnessConfig)[]) {
    const value = rows.find((r) => r.key === FAIRNESS_CONFIG_KEYS[name])?.value
    if (value === undefined || !Number.isFinite(value) || value < 0) continue
    if (FRACTIONS.has(name) && value > 1) continue
    if (COUNTS.has(name) && (value < 1 || !Number.isInteger(value))) continue
    config[name] = value
  }
  return config
}

export type FairnessContext = {
  config: FairnessConfig
  /** The session seed: picks which under-seen talents get the exploration slots. */
  seed: number
  /** Platform-wide 7-day impressions at `exposurePercentile`, computed by the API. */
  exposureThreshold: number
}

/** A ranked card after stage 3: its score net of any penalty, and how it got its slot. */
export type FairCandidate = ScoredCandidate & {
  exposurePenalty: number
  /** Drawn for exploration and placed ahead of where its score alone would put it. */
  explored: boolean
}

/** FNV-1a over the seed and id: a stable, seeded order with no shared random state. */
function seededHash(seed: number, id: string) {
  let hash = 0x811c9dc5 ^ seed
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const byScore = (a: FairCandidate, b: FairCandidate) => b.score - a.score

/**
 * 1. Exposure penalty: above the threshold, the score drops in proportion to how far above it
 * the talent is, up to `exposurePenaltyMax`. A demotion, never a removal.
 */
export function applyExposurePenalty(
  scored: readonly ScoredCandidate[],
  context: FairnessContext,
): FairCandidate[] {
  const { config } = context
  const threshold = Math.max(context.exposureThreshold, config.exposureMinImpressions, 1)
  return scored
    .map((candidate) => {
      const seen = candidate.impressions7d
      if (seen <= threshold || candidate.score <= 0) {
        return { ...candidate, exposurePenalty: 0, explored: false }
      }
      const cut = Math.min(config.exposurePenaltyMax, config.exposurePenaltyStrength * (seen / threshold - 1))
      const penalty = candidate.score * cut
      const reason: DeckReason = { code: "exposure", contribution: -penalty }
      return {
        ...candidate,
        score: candidate.score - penalty,
        reasons: [...candidate.reasons, reason],
        exposurePenalty: penalty,
        explored: false,
      }
    })
    .sort(byScore)
}

/** Whether slot `index` (0-based) is reserved for exploration: spreads `fraction` evenly. */
export function isExplorationSlot(index: number, fraction: number) {
  return Math.floor((index + 1) * fraction) > Math.floor(index * fraction)
}

/** The under-seen pool: the lowest `explorationDecile` of candidates by lifetime impressions. */
export function explorationEligible(ranked: readonly FairCandidate[], context: FairnessContext) {
  if (ranked.length === 0) return []
  const size = Math.ceil(ranked.length * context.config.explorationDecile)
  return [...ranked]
    .sort(
      (a, b) =>
        a.lifetimeImpressions - b.lifetimeImpressions ||
        seededHash(context.seed, a.talentId) - seededHash(context.seed, b.talentId),
    )
    .slice(0, size)
}

/**
 * The talents exploration will place: one per reserved slot (`explorationFraction` of the
 * deck), drawn from the under-seen pool in a seeded random order.
 */
export function drawExplorers(ranked: readonly FairCandidate[], context: FairnessContext): Set<string> {
  const slots = Math.floor(ranked.length * context.config.explorationFraction)
  const draw = context.seed ^ 0x9e3779b9
  return new Set(
    explorationEligible(ranked, context)
      .sort((a, b) => seededHash(draw, a.talentId) - seededHash(draw, b.talentId))
      .slice(0, slots)
      .map((c) => c.talentId),
  )
}

/**
 * 2. Exploration injection (epsilon-greedy): up to `explorationFraction` of slots, evenly
 * spread, go to under-seen talents drawn in a seeded random order. Exploration only ever
 * promotes: a drawn talent whose own score already ranks it earlier keeps that place, and only
 * a talent placed ahead of a higher-scored card is marked `explored`.
 */
export function injectExploration(ranked: readonly FairCandidate[], context: FairnessContext): FairCandidate[] {
  const fraction = context.config.explorationFraction
  const drawn = drawExplorers(ranked, context)
  if (drawn.size === 0) return [...ranked]

  // Both lists keep the ranked (score) order.
  const explorers = ranked.filter((c) => drawn.has(c.talentId))
  const rest = ranked.filter((c) => !drawn.has(c.talentId))
  const out: FairCandidate[] = []
  let e = 0
  let r = 0
  for (let i = 0; i < ranked.length; i++) {
    const explorer = explorers[e]
    const next = rest[r]
    if (explorer && (!next || explorer.score >= next.score)) {
      out.push(explorer) // on merit
      e++
    } else if (explorer && isExplorationSlot(i, fraction)) {
      out.push({
        ...explorer,
        explored: true,
        reasons: [...explorer.reasons, { code: "exploration", contribution: 0 }],
      })
      e++
    } else {
      out.push(next!)
      r++
    }
  }
  return out
}

/** The values a card shares with neighbours for spacing: categories, city, agency. */
function spacingValues(c: FairCandidate): string[][] {
  return [[...c.categoryIds], c.cityId ? [c.cityId] : [], c.agencyId ? [c.agencyId] : []]
}

/** Whether `next` would make more than `maxRun` consecutive cards share one value. */
function extendsRun(out: readonly FairCandidate[], next: FairCandidate, maxRun: number) {
  if (out.length < maxRun) return false
  const recent = out.slice(-maxRun).map(spacingValues)
  return spacingValues(next).some((values, dimension) =>
    values.some((value) => recent.every((card) => card[dimension]!.includes(value))),
  )
}

/**
 * 3. Diversity spacing: no more than `diversityMaxRun` cards in a row share a category, a city
 * or an agency. When the next card would extend a run, the first card within `diversityWindow`
 * that doesn't takes its place; if none does (a narrow pool), the order stands.
 */
export function spaceForDiversity(sequence: readonly FairCandidate[], config: FairnessConfig): FairCandidate[] {
  const pending = [...sequence]
  const out: FairCandidate[] = []
  while (pending.length > 0) {
    const reach = Math.min(config.diversityWindow, pending.length)
    let pick = 0
    for (let j = 0; j < reach; j++) {
      if (!extendsRun(out, pending[j]!, config.diversityMaxRun)) {
        pick = j
        break
      }
    }
    out.push(...pending.splice(pick, 1))
  }
  return out
}

/** Stage 3: penalty, then exploration, then spacing. Same seed and inputs, same deck. */
export function applyFairness(
  scored: readonly ScoredCandidate[],
  context: FairnessContext,
): FairCandidate[] {
  const penalised = applyExposurePenalty(scored, context)
  return spaceForDiversity(injectExploration(penalised, context), context.config)
}
