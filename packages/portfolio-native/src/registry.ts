import { corePortfolioSectionTypes } from "@workspace/schema"

import { aboutRenderer } from "./sections/about"
import { galleryRenderer } from "./sections/gallery"
import {
  attributesRenderer,
  availabilityRenderer,
  creditsRenderer,
  languagesRenderer,
  ratesRenderer,
  skillsRenderer,
} from "./sections/list-sections"
import { heroRenderer } from "./sections/hero"
import { showreelRenderer } from "./sections/showreel"
import type { CoreSectionType, SectionMediaMeta, StudioSectionRegistry } from "./types"
import type { PortfolioSection } from "@workspace/schema"

/** Studio may only import core section types that ship with height estimators. */
export const studioSectionRegistry = {
  hero: heroRenderer,
  about: aboutRenderer,
  gallery: galleryRenderer,
  showreel: showreelRenderer,
  credits: creditsRenderer,
  attributes: attributesRenderer,
  skills: skillsRenderer,
  languages: languagesRenderer,
  rates: ratesRenderer,
  availability: availabilityRenderer,
} satisfies StudioSectionRegistry

export const studioSectionTypes = corePortfolioSectionTypes

export function assertStudioSectionType(type: string): CoreSectionType {
  if (!(type in studioSectionRegistry)) {
    throw new Error(`Section type "${type}" is not available in the studio (missing renderer or estimateHeight).`)
  }
  return type as CoreSectionType
}

export function estimateSectionHeight(section: PortfolioSection, mediaMeta: SectionMediaMeta): number {
  const type = assertStudioSectionType(section.type)
  const renderer = studioSectionRegistry[type]
  return renderer.estimateHeight(section.config as never, mediaMeta)
}
