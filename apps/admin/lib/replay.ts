import type { DeckFilters } from "@workspace/schema"

/** Link that replays a session's deck: same role, filters and seed. */
export function replayHref(bookerId: string, s: { roleId: string | null; seed: number; filters: DeckFilters }) {
  const query = new URLSearchParams({ run: "1", seed: String(s.seed) })
  if (s.roleId) query.set("roleId", s.roleId)
  if (Object.keys(s.filters).length > 0) query.set("filters", JSON.stringify(s.filters))
  return `/deck/${bookerId}?${query}`
}
