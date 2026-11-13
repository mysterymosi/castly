/**
 * Inputs used for completeness. Sensitive attributes are never passed in (§7.3.1): the attribute
 * count is standard tier only. Rate visibility is not an input either; hiding rates costs nothing.
 */
export type CompletenessInput = {
  hasDisplayName: boolean
  hasCity: boolean
  hasBio: boolean
  photoCount: number
  skillCount: number
  /** The sections the portfolio's layout includes (`portfolioLayoutFor`). */
  visibleSectionTypes: string[]
  /** A showreel is uploaded. */
  hasShowreelMedia: boolean
  /** Rows behind the list sections. A visible section scores only when it has some. */
  contentCounts: {
    credits: number
    languages: number
    rates: number
    availabilityMonths: number
    standardAttributes: number
  }
  categoryCount: number
}

export type PublishBlocker = "quick_start" | "category"

export type CompletenessNextStep = { key: string; label: string; points: number }

export type CompletenessResult = {
  score: number
  quickStartMet: boolean
  canPublish: boolean
  weights: {
    profileBasics: number
    photos: number
    skills: number
    sections: number
    showreel: number
  }
  /** The most valuable thing to add next (PRD §6.1 step 6), or null when nothing is left. */
  nextStep: CompletenessNextStep | null
  /** What publishing still needs; empty when `canPublish`. */
  publishBlockers: PublishBlocker[]
}

const WEIGHT = {
  profileBasics: 25,
  photos: 20,
  skills: 20,
  sections: 20,
  showreel: 15,
} as const

const SECTION_POINTS = 4

/** List and text sections in the order the meter suggests them, with what counts as content. */
const sectionContent: { type: string; label: string; has: (input: CompletenessInput) => boolean }[] = [
  { type: "about", label: "Write your bio", has: (i) => i.hasBio },
  { type: "skills", label: "Add your skills", has: (i) => i.skillCount > 0 },
  { type: "credits", label: "Add your first credit", has: (i) => i.contentCounts.credits > 0 },
  { type: "languages", label: "Add the languages you speak", has: (i) => i.contentCounts.languages > 0 },
  {
    type: "availability",
    label: "Mark the months you're free",
    has: (i) => i.contentCounts.availabilityMonths > 0,
  },
  {
    type: "attributes",
    label: "Add your casting details",
    has: (i) => i.contentCounts.standardAttributes > 0,
  },
  { type: "rates", label: "Set your rates", has: (i) => i.contentCounts.rates > 0 },
]

function partial(count: number, target: number, weight: number) {
  return count >= target ? weight : Math.round((Math.min(count, target) / target) * weight)
}

export function computeCompleteness(input: CompletenessInput): CompletenessResult {
  const profileBasics =
    input.hasDisplayName && input.hasCity && input.hasBio ? WEIGHT.profileBasics : 0
  const photos = partial(input.photoCount, 3, WEIGHT.photos)
  const skills = partial(input.skillCount, 3, WEIGHT.skills)

  const visible = new Set(input.visibleSectionTypes)
  // A section earns its points only when it is visible and has something in it.
  const earning = sectionContent.filter((s) => visible.has(s.type) && s.has(input))
  const sections = Math.min(WEIGHT.sections, earning.length * SECTION_POINTS)
  const showreel = visible.has("showreel") && input.hasShowreelMedia ? WEIGHT.showreel : 0

  const score = Math.min(100, profileBasics + photos + skills + sections + showreel)
  const quickStartMet =
    input.hasDisplayName &&
    input.hasCity &&
    input.hasBio &&
    input.photoCount >= 3 &&
    input.skillCount >= 3

  const publishBlockers: PublishBlocker[] = []
  if (!quickStartMet) publishBlockers.push("quick_start")
  if (input.categoryCount === 0) publishBlockers.push("category")

  return {
    score,
    quickStartMet,
    canPublish: publishBlockers.length === 0,
    weights: { profileBasics, photos, skills, sections, showreel },
    nextStep: nextStep(input, { quickStartMet, sections, showreel, photos }),
    publishBlockers,
  }
}

function nextStep(
  input: CompletenessInput,
  earned: { quickStartMet: boolean; sections: number; showreel: number; photos: number }
): CompletenessNextStep | null {
  if (!earned.quickStartMet) return { key: "quick_start", label: "Finish quick start", points: 0 }
  // Not points, but nothing reaches a role's deck without one.
  if (input.categoryCount === 0) return { key: "category", label: "Pick what you do", points: 0 }

  const candidates: CompletenessNextStep[] = []
  if (earned.showreel === 0) {
    candidates.push({ key: "showreel", label: "Upload a showreel", points: WEIGHT.showreel })
  }
  if (earned.photos < WEIGHT.photos) {
    candidates.push({ key: "photos", label: "Add more photos", points: WEIGHT.photos - earned.photos })
  }
  const sectionRoom = WEIGHT.sections - earned.sections
  if (sectionRoom > 0) {
    const visible = new Set(input.visibleSectionTypes)
    const missing = sectionContent.find((s) => !(visible.has(s.type) && s.has(input)))
    if (missing) {
      candidates.push({
        key: missing.type,
        label: missing.label,
        points: Math.min(SECTION_POINTS, sectionRoom),
      })
    }
  }
  // Highest value first; ties keep the order above.
  return candidates.reduce<CompletenessNextStep | null>(
    (best, c) => (best === null || c.points > best.points ? c : best),
    null
  )
}
