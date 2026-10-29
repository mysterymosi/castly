/**
 * Category weights for one booker vertical, keyed by category id, each 0–1. Loaded from
 * `vertical_category_weights` (ops-editable); a category with no row is absent here and counts 0.
 */
export type VerticalCategoryWeights = Readonly<Record<string, number>>

/**
 * `verticalCategoryMatch` in the deck score (TECH_SPEC §7.2): how well a talent's categories fit
 * what the booker's vertical leans toward — the strongest weight among them, 0 when none apply.
 * The vertical is never named here; the weights are the whole mapping.
 */
export function verticalCategoryMatch(
  talentCategoryIds: readonly string[],
  weights: VerticalCategoryWeights,
): number {
  let best = 0
  for (const id of talentCategoryIds) {
    const weight = weights[id]
    if (weight !== undefined && weight > best) best = weight
  }
  return Math.min(best, 1)
}
