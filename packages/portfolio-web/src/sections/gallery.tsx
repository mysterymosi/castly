import { SectionImage } from "../media"
import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, WebSectionProps } from "../types"

type GalleryConfig = CoreSectionConfigMap["gallery"]

const layoutClass: Record<GalleryConfig["layout"], { list: string; item: string }> = {
  grid: {
    list: "grid grid-cols-2 gap-2 sm:grid-cols-3",
    item: "aspect-[3/4] overflow-hidden rounded-lg [&_img]:h-full",
  },
  masonry: {
    list: "columns-2 gap-2 sm:columns-3",
    item: "mb-2 break-inside-avoid overflow-hidden rounded-lg",
  },
  carousel: {
    list: "-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6",
    item: "w-3/4 shrink-0 snap-start overflow-hidden rounded-lg sm:w-2/5",
  },
}

export function GallerySection({ config, context }: WebSectionProps<GalleryConfig>) {
  const ids = config.mediaIds.filter((id) => context.mediaMeta[id])
  if (ids.length === 0) return null
  const classes = layoutClass[config.layout]
  return (
    <SectionShell type="gallery" title="Gallery">
      <ul className={classes.list}>
        {ids.map((id, i) => (
          <li key={id} data-media-id={id} className={classes.item}>
            <SectionImage
              mediaId={id}
              context={context}
              alt={`Photo ${i + 1} of ${ids.length}`}
              sizes="(min-width: 640px) 33vw, 50vw"
            />
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}
