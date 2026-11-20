import type { BookerVertical } from "@workspace/schema"

/** How a booker's vertical reads mid-sentence. "Other" has no honest noun, so it is just a booker. */
export const verticalNoun: Record<BookerVertical, string> = {
  casting_director: "casting director",
  producer: "producer",
  director: "director",
  brand_or_agency: "brand or agency",
  event_planner: "event planner",
  photographer: "photographer",
  content_creator: "content creator",
  other: "booker",
}

/**
 * The line a talent reads for a new interest, in the inbox and (6.5) in push and SMS:
 * "A casting director is interested in you for Lagos Nights". Professional, not playful — the
 * word is "interested" (PRD §9). The project is named when the swipe carried a role.
 */
export function interestHeadline(vertical: BookerVertical, projectName: string | null): string {
  const noun = verticalNoun[vertical]
  const article = /^[aeiou]/.test(noun) ? "An" : "A"
  const base = `${article} ${noun} is interested in you`
  return projectName ? `${base} for ${projectName}` : base
}
