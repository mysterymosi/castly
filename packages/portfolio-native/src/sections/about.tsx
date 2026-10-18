import { StyleSheet, Text, View } from "react-native"

import { CARD_WIDTH, DEFAULT_HERO_ASPECT, SECTION_TITLE_HEIGHT } from "../constants"
import { estimateTextBlockHeight, mediaHeightForWidth } from "../layout"
import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, NativeSectionRenderer, SectionMediaMeta } from "../types"

type AboutConfig = CoreSectionConfigMap["about"]

export function estimateHeight(config: AboutConfig, mediaMeta: SectionMediaMeta): number {
  let h = SECTION_TITLE_HEIGHT + 24
  h += estimateTextBlockHeight(config.body, CARD_WIDTH - 32, 20, 42, 8)
  if (config.mediaId) {
    h += mediaHeightForWidth(config.mediaId, CARD_WIDTH - 32, mediaMeta, DEFAULT_HERO_ASPECT) + 8
  }
  return h + 24
}

function AboutSection({ config, mediaMeta, cardWidth = CARD_WIDTH }: { config: AboutConfig; mediaMeta: SectionMediaMeta; cardWidth?: number }) {
  const inner = cardWidth - 32
  const mediaH = config.mediaId
    ? mediaHeightForWidth(config.mediaId, inner, mediaMeta, DEFAULT_HERO_ASPECT)
    : 0
  return (
    <SectionShell cardWidth={cardWidth}>
      <Text style={styles.title}>About</Text>
      {config.body ? <Text style={styles.body}>{config.body}</Text> : null}
      {config.mediaId ? <View style={[styles.media, { height: mediaH, width: inner }]} /> : null}
    </SectionShell>
  )
}

export const aboutRenderer: NativeSectionRenderer<AboutConfig> = {
  estimateHeight,
  Section: AboutSection,
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, color: "#404040" },
  media: { marginTop: 8, backgroundColor: "#e5e5e5", borderRadius: 8 },
})
