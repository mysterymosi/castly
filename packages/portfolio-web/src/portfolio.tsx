import {
  readStoredPortfolioSection,
  type PortfolioSection,
  type TalentSectionDto,
} from "@workspace/schema"

import { defaultMediaComponents } from "./media"
import { isWebSectionType, webSectionRegistry } from "./registry"
import type {
  PortfolioContent,
  PortfolioMediaComponents,
  PortfolioMediaMeta,
  PortfolioRenderContext,
} from "./types"

/**
 * Visible sections in position order, re-read through the schema registry so a stale row is
 * forward-migrated and validated before it is rendered.
 */
export function sectionsFromDto(sections: TalentSectionDto[]): PortfolioSection[] {
  return sections
    .filter((section) => section.isVisible)
    .sort((a, b) => a.position - b.position)
    .map((section) =>
      readStoredPortfolioSection({
        type: section.type,
        schemaVersion: section.schemaVersion,
        config: section.config,
      })
    )
}

export function renderPortfolioSection(
  section: PortfolioSection,
  context: PortfolioRenderContext,
  key?: string
) {
  // A type without a web renderer is skipped rather than failing the public page.
  if (!isWebSectionType(section.type)) return null
  const Section = webSectionRegistry[section.type]
  return <Section key={key} config={section.config as never} context={context} />
}

type PortfolioSectionsProps = {
  /** Validated, current-version sections in display order (see `sectionsFromDto`). */
  sections: PortfolioSection[]
  mediaMeta?: PortfolioMediaMeta
  content?: PortfolioContent
  components?: PortfolioMediaComponents
  /** Reference date for the availability horizon. Pass one from the page for deterministic output. */
  now?: Date
}

/** Stacked, server-rendered portfolio. No hooks or client state: safe in a Server Component. */
export function PortfolioSections({
  sections,
  mediaMeta = {},
  content = {},
  components = defaultMediaComponents,
  now = new Date(),
}: PortfolioSectionsProps) {
  const context: PortfolioRenderContext = { mediaMeta, content, components, now }
  return (
    <div data-portfolio className="divide-border mx-auto flex w-full max-w-3xl flex-col divide-y">
      {sections.map((section, i) =>
        renderPortfolioSection(section, context, `${section.type}-${i}`)
      )}
    </div>
  )
}
