import { StyleSheet, Text, View } from "react-native"

import { CARD_WIDTH, SECTION_TITLE_HEIGHT } from "../constants"
import { showreelMediaHeight } from "../layout"
import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, NativeSectionRenderer, SectionMediaMeta } from "../types"

type ShowreelConfig = CoreSectionConfigMap["showreel"]

export function estimateHeight(config: ShowreelConfig, mediaMeta: SectionMediaMeta): number {
  const mediaH = showreelMediaHeight(config.mediaId, CARD_WIDTH, mediaMeta)
  return SECTION_TITLE_HEIGHT + mediaH + (config.headline ? 28 : 0) + 24
}

function ShowreelSection({ config, mediaMeta, cardWidth = CARD_WIDTH }: { config: ShowreelConfig; mediaMeta: SectionMediaMeta; cardWidth?: number }) {
  const mediaH = showreelMediaHeight(config.mediaId, cardWidth, mediaMeta)
  return (
    <SectionShell cardWidth={cardWidth}>
      <Text style={styles.title}>Showreel</Text>
      <View style={[styles.video, { height: mediaH, width: cardWidth - 32 }]} />
      {config.headline ? <Text style={styles.headline}>{config.headline}</Text> : null}
    </SectionShell>
  )
}

export const showreelRenderer: NativeSectionRenderer<ShowreelConfig> = {
  estimateHeight,
  Section: ShowreelSection,
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  video: { backgroundColor: "#171717", borderRadius: 8 },
  headline: { fontSize: 14, marginTop: 8, color: "#404040" },
})
