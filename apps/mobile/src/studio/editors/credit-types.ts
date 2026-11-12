import { creditTypes } from "@workspace/schema"

export type CreditType = (typeof creditTypes)[number]

const labels: Record<CreditType, string> = {
  film: "Film",
  tv: "TV",
  commercial: "Commercial",
  music_video: "Music video",
  theatre: "Theatre",
  campaign: "Campaign",
}

export const creditTypeOptions = creditTypes.map((value) => ({ value, label: labels[value] }))

/** Display label for a stored type; types from older data show as stored. */
export function creditTypeLabel(type: string) {
  return labels[type as CreditType] ?? type
}

/** A stored type the editors can send back; a free-text type from older data becomes none. */
export function asCreditType(type: string | null): CreditType | null {
  return type && (creditTypes as readonly string[]).includes(type) ? (type as CreditType) : null
}
