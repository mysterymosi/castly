/**
 * The deck engine's pure stages (TECH_SPEC §7). Stage 1 (candidate SQL) and stage 4 (the queue
 * write) live in the API; stages 2 and 3 live here so they can be tested without a database.
 */

/** A stage 1 row from `talent_search`, already in the session's seeded pre-order. */
export type DeckCandidate = {
  talentId: string
  /** 0–100, from the `talent.search-scores` job. */
  qualityScore: number
  categoryIds: readonly string[]
  cityId: string | null
}

/** One "why this card" entry. Scoring appends these; the card's reason string reads them (5.11). */
export type DeckReason = { code: string; contribution: number }

export type ScoredCandidate = DeckCandidate & { score: number; reasons: DeckReason[] }

/**
 * Stage 2, interim: quality only, so the queue has a real order. The weighted sum from
 * `ranking_weights` replaces this in M5 5.6. Sorting is stable, so tied candidates keep stage 1's
 * seeded order — which is what makes two sessions differ.
 */
export function scoreCandidates(candidates: readonly DeckCandidate[]): ScoredCandidate[] {
  const scored = candidates.map((candidate) => {
    const quality = candidate.qualityScore / 100
    return {
      ...candidate,
      score: quality,
      reasons: quality > 0 ? [{ code: "quality", contribution: quality }] : [],
    }
  })
  return scored.sort((a, b) => b.score - a.score)
}

/**
 * Stage 3, interim: the scored order unchanged. Exposure penalty, exploration injection and
 * diversity spacing land in M5 5.7.
 */
export function applyFairness(scored: readonly ScoredCandidate[]): ScoredCandidate[] {
  return [...scored]
}
