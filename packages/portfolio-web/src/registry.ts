import { AboutSection } from "./sections/about"
import { GallerySection } from "./sections/gallery"
import { HeroSection } from "./sections/hero"
import {
  AttributesSection,
  AvailabilitySection,
  CreditsSection,
  LanguagesSection,
  RatesSection,
  SkillsSection,
} from "./sections/list-sections"
import { ShowreelSection } from "./sections/showreel"
import type { CoreSectionType, WebSectionRegistry } from "./types"

export const webSectionRegistry = {
  hero: HeroSection,
  about: AboutSection,
  gallery: GallerySection,
  showreel: ShowreelSection,
  credits: CreditsSection,
  attributes: AttributesSection,
  skills: SkillsSection,
  languages: LanguagesSection,
  rates: RatesSection,
  availability: AvailabilitySection,
} satisfies WebSectionRegistry

export function isWebSectionType(type: string): type is CoreSectionType {
  return type in webSectionRegistry
}
