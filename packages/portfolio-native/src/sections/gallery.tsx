import { Text, View } from "react-native"

import { CARD_WIDTH, SECTION_HORIZONTAL_PADDING, SECTION_TITLE_HEIGHT } from "../constants"
import { galleryTileHeight } from "../layout"
import { SectionImage } from "../media"
import { SectionShell, SectionTitle } from "../section-shell"
import type { CoreSectionConfigMap, NativeSectionRenderer, SectionMediaMeta } from "../types"

type GalleryConfig = CoreSectionConfigMap["gallery"]

const GAP = 8

export function estimateHeight(config: GalleryConfig, mediaMeta: SectionMediaMeta): number {
  const ids = config.mediaIds ?? []
  if (ids.length === 0) return SECTION_TITLE_HEIGHT + 80
  const rows = Math.ceil(ids.length / 2)
  const tileH = galleryTileHeight(CARD_WIDTH, mediaMeta, ids[0]!)
  return SECTION_TITLE_HEIGHT + rows * (tileH + GAP) + 24
}

function GallerySection({ config, mediaMeta, cardWidth = CARD_WIDTH }: { config: GalleryConfig; mediaMeta: SectionMediaMeta; cardWidth?: number }) {
  const ids = config.mediaIds ?? []
  const tileW = (cardWidth - SECTION_HORIZONTAL_PADDING * 2 - GAP) / 2
  const tileH = ids[0] ? galleryTileHeight(cardWidth, mediaMeta, ids[0]) : 120
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>Gallery</SectionTitle>
      {ids.length === 0 ? (
        <Text testID="portfolio-placeholder" className="font-body text-footnote text-textMuted">
          No photos yet
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {ids.map((id) => (
            <SectionImage
              key={id}
              mediaId={id}
              mediaMeta={mediaMeta}
              width={tileW}
              height={tileH}
              className="rounded-md"
            />
          ))}
        </View>
      )}
    </SectionShell>
  )
}

export const galleryRenderer: NativeSectionRenderer<GalleryConfig> = {
  estimateHeight,
  Section: GallerySection,
}
