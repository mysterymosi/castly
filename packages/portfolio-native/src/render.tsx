import type { PortfolioSection } from "@workspace/schema"

import { assertStudioSectionType, studioSectionRegistry } from "./registry"
import type { SectionMediaMeta } from "./types"

export function renderStudioSection(
  section: PortfolioSection,
  mediaMeta: SectionMediaMeta,
  cardWidth?: number,
) {
  const type = assertStudioSectionType(section.type)
  const { Section } = studioSectionRegistry[type]
  return (
    <Section config={section.config as never} mediaMeta={mediaMeta} cardWidth={cardWidth} />
  )
}
