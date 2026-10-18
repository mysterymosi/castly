import { StyleSheet, Text, View } from "react-native"

import { CARD_WIDTH, SECTION_TITLE_HEIGHT } from "../constants"
import { galleryTileHeight } from "../layout"
import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, NativeSectionRenderer, SectionMediaMeta } from "../types"

type GalleryConfig = CoreSectionConfigMap["gallery"]

export function estimateHeight(config: GalleryConfig, mediaMeta: SectionMediaMeta): number {
  const ids = config.mediaIds ?? []
  if (ids.length === 0) return SECTION_TITLE_HEIGHT + 80
  const rows = Math.ceil(ids.length / 2)
  const tileH = galleryTileHeight(CARD_WIDTH, mediaMeta, ids[0]!)
  return SECTION_TITLE_HEIGHT + rows * (tileH + 8) + 24
}

function GallerySection({ config, mediaMeta, cardWidth = CARD_WIDTH }: { config: GalleryConfig; mediaMeta: SectionMediaMeta; cardWidth?: number }) {
  const ids = config.mediaIds ?? []
  const tileW = (cardWidth - 32 - 8) / 2
  const tileH = ids[0] ? galleryTileHeight(cardWidth, mediaMeta, ids[0]) : 120
  return (
    <SectionShell cardWidth={cardWidth}>
      <Text style={styles.title}>Gallery</Text>
      <View style={styles.grid}>
        {ids.map((id) => (
          <View key={id} style={[styles.tile, { width: tileW, height: tileH }]} />
        ))}
      </View>
    </SectionShell>
  )
}

export const galleryRenderer: NativeSectionRenderer<GalleryConfig> = {
  estimateHeight,
  Section: GallerySection,
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { backgroundColor: "#e5e5e5", borderRadius: 6 },
})
