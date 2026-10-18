/** Inputs used for completeness — sensitive attributes are never passed in (§7.3.1). */
export type CompletenessInput = {
  hasDisplayName: boolean
  hasCity: boolean
  hasBio: boolean
  photoCount: number
  skillCount: number
  visibleSectionTypes: string[]
}

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
}

const WEIGHT = {
  profileBasics: 25,
  photos: 20,
  skills: 20,
  sections: 20,
  showreel: 15,
} as const

export function computeCompleteness(input: CompletenessInput): CompletenessResult {
  const profileBasics =
    input.hasDisplayName && input.hasCity && input.hasBio ? WEIGHT.profileBasics : 0
  const photos =
    input.photoCount >= 3
      ? WEIGHT.photos
      : Math.round((Math.min(input.photoCount, 3) / 3) * WEIGHT.photos)
  const skills =
    input.skillCount >= 3
      ? WEIGHT.skills
      : Math.round((Math.min(input.skillCount, 3) / 3) * WEIGHT.skills)

  const coreTypes = new Set(input.visibleSectionTypes)
  const sectionPoints =
    (coreTypes.has("about") ? 4 : 0) +
    (coreTypes.has("gallery") ? 4 : 0) +
    (coreTypes.has("hero") ? 4 : 0) +
    (coreTypes.has("skills") ? 4 : 0) +
    (coreTypes.has("credits") ? 4 : 0)
  const sections = Math.min(WEIGHT.sections, sectionPoints)

  const showreel = coreTypes.has("showreel") ? WEIGHT.showreel : 0

  const score = Math.min(100, profileBasics + photos + skills + sections + showreel)
  const quickStartMet =
    input.hasDisplayName &&
    input.hasCity &&
    input.hasBio &&
    input.photoCount >= 3 &&
    input.skillCount >= 3

  return {
    score,
    quickStartMet,
    canPublish: quickStartMet,
    weights: { profileBasics, photos, skills, sections, showreel },
  }
}
