import type { PortfolioSection } from "@workspace/schema"

import { assertStudioSectionType, studioSectionRegistry } from "./registry"
import type { PortfolioContent, SectionMediaMeta } from "./types"

export function renderStudioSection(
  section: PortfolioSection,
  mediaMeta: SectionMediaMeta,
  cardWidth?: number,
  options: { content?: PortfolioContent; now?: Date } = {},
) {
  const type = assertStudioSectionType(section.type)
  const { Section } = studioSectionRegistry[type]
  return (
    <Section
      config={section.config as never}
      mediaMeta={mediaMeta}
      cardWidth={cardWidth}
      content={options.content}
      now={options.now}
    />
  )
}
