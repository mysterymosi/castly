import {
  layoutPortfolioPage,
  readVisibleSections,
  withShowablePhotos,
  type PortfolioSection,
} from "@workspace/schema"

import { SectionImage } from "./media"

import { defaultMediaComponents } from "./media"
import { isWebSectionType, webSectionRegistry } from "./registry"
import type {
  PortfolioContent,
  PortfolioMediaComponents,
  PortfolioMediaMeta,
  PortfolioRenderContext,
} from "./types"

/** Visible sections in position order, forward-migrated and validated (shared with native). */
export const sectionsFromDto = readVisibleSections

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

/**
 * One of the talent's photos between sections (`layoutPortfolioPage`). The shell carries
 * `data-section-type="photo"` so the parity check sees photos in their place.
 */
function PortfolioPhoto({
  mediaId,
  index,
  count,
  context,
}: {
  mediaId: string
  index: number
  count: number
  context: PortfolioRenderContext
}) {
  return (
    <section data-section-type="photo" className="px-4 py-4 sm:px-6">
      <SectionImage
        mediaId={mediaId}
        context={context}
        alt={`Photo ${index + 1} of ${count}`}
        sizes="(min-width: 768px) 720px, 100vw"
        className="overflow-hidden rounded-xl"
      />
    </section>
  )
}

/**
 * Stacked, server-rendered portfolio: sections in order with the talent's photos spread between
 * them (Main in the hero, or first). No hooks or client state: safe in a Server Component.
 */
export function PortfolioSections({
  sections,
  mediaMeta = {},
  content = {},
  components = defaultMediaComponents,
  now = new Date(),
}: PortfolioSectionsProps) {
  const shown = withShowablePhotos(content, (id) => Boolean(mediaMeta[id]))
  const context: PortfolioRenderContext = { mediaMeta, content: shown, components, now }
  const photos = shown.photoMediaIds ?? []
  return (
    <div data-portfolio className="divide-border mx-auto flex w-full max-w-3xl flex-col divide-y">
      {layoutPortfolioPage(sections, photos).map((item, i) =>
        item.kind === "section" ? (
          renderPortfolioSection(item.section, context, `${item.section.type}-${i}`)
        ) : (
          <PortfolioPhoto
            key={`photo-${item.mediaId}`}
            mediaId={item.mediaId}
            index={item.index}
            count={photos.length}
            context={context}
          />
        )
      )}
    </div>
  )
}
