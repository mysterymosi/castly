import type { DeckReason, RankingWeights, ScoreTerm } from "./deck.js"

/**
 * What the card's reason line may name, all of it already visible to this booker on the card:
 * the talent's city, and the visible languages and accents the role asked for. Never a hidden or
 * sensitive value — the reasons themselves only carry keys and levels.
 */
export type ReasonTextFacts = {
  cityName: string | null
  matchedLanguages: readonly string[]
  matchedAccents: readonly string[]
}

/** Most parts the line shows, so it fits under the caption. A boost comes first, so it always shows. */
export const REASON_TEXT_MAX_PARTS = 3

/**
 * A plain term is named only when it scored at least this share of its weight, so "Strong
 * portfolio" never appears on a weak one.
 */
export const REASON_TEXT_STRONG = 0.7

const GENERIC: Partial<Record<ScoreTerm, string>> = {
  quality: "Strong portfolio",
  freshness: "Recently updated",
  responsiveness: "Replies quickly",
}

function list(names: readonly string[]) {
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

/**
 * The card's "why you're seeing this" line (PRD §7.2.3), derived only from the `reasons` that
 * scoring and fairness wrote, so it can't drift from the ranking (TECH_SPEC §7.2). Specific
 * reasons come first — a boost, an exploration slot, what matched the role, where they are —
 * then, if there's room, the strongest plain term. `weights` tell how strong a plain term was.
 * Returns null when nothing is worth saying.
 */
export function deckReasonText(
  reasons: readonly DeckReason[],
  facts: ReasonTextFacts,
  weights: RankingWeights,
): string | null {
  const by = new Map(reasons.map((r) => [r.code, r]))
  const parts: string[] = []
  // Paid placement is always disclosed, whatever else the line says.
  if ((by.get("boost")?.contribution ?? 0) > 0) parts.push("Promoted")
  if (by.has("exploration")) parts.push("Discovery pick")

  const matched = by.get("role")?.detail?.matched
  const matchedKeys = Array.isArray(matched) ? matched : []
  if (matchedKeys.includes("languages") && facts.matchedLanguages.length > 0) {
    parts.push(`Speaks ${list(facts.matchedLanguages)}`)
  }
  if (matchedKeys.includes("accents") && facts.matchedAccents.length > 0) {
    parts.push(`${list(facts.matchedAccents)} accent${facts.matchedAccents.length > 1 ? "s" : ""}`)
  }

  const level = by.get("geo")?.detail?.level
  if (level === "city") parts.push(facts.cityName ? `In ${facts.cityName}` : "In your city")
  else if (level === "region") parts.push("Near you")

  if (matchedKeys.length > 0) parts.push("Matches your role")
  if ((by.get("raisedHand")?.contribution ?? 0) > 0) parts.push("Raised a hand for this role")

  if (parts.length < REASON_TEXT_MAX_PARTS) {
    const strongest = reasons
      .filter((r) => GENERIC[r.code as ScoreTerm] && weights[r.code as keyof RankingWeights] > 0)
      .filter((r) => r.contribution / weights[r.code as keyof RankingWeights] >= REASON_TEXT_STRONG)
      .sort((a, b) => b.contribution - a.contribution)[0]
    if (strongest) parts.push(GENERIC[strongest.code as ScoreTerm]!)
  }
  if (parts.length === 0 && level === "country") parts.push("In your country")

  return parts.slice(0, REASON_TEXT_MAX_PARTS).join(" · ") || null
}
