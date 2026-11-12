import type { corePortfolioSectionTypes } from "@workspace/schema"

import type { IconName } from "@/components/ui/icon"
import type { studioApi } from "@/studio/api"

export type CoreSectionType = (typeof corePortfolioSectionTypes)[number]
export type TemplateId = Parameters<typeof studioApi.applyTemplate>[0]

export const sectionMeta: Record<CoreSectionType, { label: string; description: string; icon: IconName }> = {
  hero: { label: "Hero", description: "Your name, headline and lead image", icon: "person" },
  about: { label: "About", description: "A short bio in your own words", icon: "text" },
  showreel: { label: "Showreel", description: "Your best work on video", icon: "film" },
  credits: { label: "Credits", description: "Productions you've worked on", icon: "star" },
  attributes: { label: "Attributes", description: "Height, build and other casting details", icon: "list" },
  skills: { label: "Skills", description: "Accents, sports, instruments and more", icon: "sparkle" },
  languages: { label: "Languages", description: "Languages you speak and how well", icon: "globe" },
  rates: { label: "Rates", description: "Day rates and terms", icon: "money" },
  availability: { label: "Availability", description: "When you're free to work", icon: "calendar" },
}

export const templates: readonly { id: TemplateId; label: string; description: string; icon: IconName }[] = [
  { id: "editorial", label: "Editorial", description: "Photos lead, story follows", icon: "photo" },
  { id: "reel_first", label: "Reel-first", description: "Showreel at the top", icon: "film" },
  { id: "case_study", label: "Case study", description: "Credits and detail up front", icon: "layers" },
]

/** Section types with a content editor, and the editor each opens (`studio/edit/[type]`). */
export const editableSectionTypes = [
  "hero",
  "about",
  "credits",
  "attributes",
  "skills",
  "languages",
  "rates",
  "availability",
] as const satisfies readonly CoreSectionType[]

export type EditableSectionType = (typeof editableSectionTypes)[number]

export function isEditableSection(type: string): type is EditableSectionType {
  return (editableSectionTypes as readonly string[]).includes(type)
}

/** The editor for a section type, or null for those edited elsewhere (the photos and the showreel). */
export function editorRoute(type: string) {
  if (!isEditableSection(type)) return null
  // Hero and About both show the profile basics (name, headline, bio).
  const editor = type === "hero" ? "about" : type
  return { pathname: "/studio/edit/[type]", params: { type: editor } } as const
}

const emptyPrompts: Partial<Record<CoreSectionType, string>> = {
  about: "Write your bio",
  credits: "Add your first credit",
  attributes: "Add your casting details",
  skills: "Pick your skills",
  languages: "Add the languages you speak",
  rates: "Set your rates",
  availability: "Mark the months you're free",
}

export function emptySectionPrompt(type: CoreSectionType) {
  return emptyPrompts[type] ?? "Add something here"
}
