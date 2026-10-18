import { StyleSheet, Text, View } from "react-native"

import {
  CARD_WIDTH,
  SECTION_TITLE_HEIGHT,
  SECTION_VERTICAL_PADDING,
} from "../constants"
import { heroMediaHeight } from "../layout"
import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, NativeSectionRenderer, SectionMediaMeta } from "../types"

type HeroConfig = CoreSectionConfigMap["hero"]

export function estimateHeight(config: HeroConfig, mediaMeta: SectionMediaMeta): number {
  const mediaH = heroMediaHeight(config.mediaId, CARD_WIDTH, mediaMeta)
  let text = SECTION_VERTICAL_PADDING * 2
  if (config.headline) text += 24
  if (config.subtitle) text += 20
  if (config.showBadges) text += 28
  return mediaH + text + SECTION_TITLE_HEIGHT
}

function HeroSection({ config, mediaMeta, cardWidth = CARD_WIDTH }: { config: HeroConfig; mediaMeta: SectionMediaMeta; cardWidth?: number }) {
  const mediaHeight = heroMediaHeight(config.mediaId, cardWidth, mediaMeta)
  return (
    <SectionShell cardWidth={cardWidth}>
      <View style={[styles.media, { height: mediaHeight, width: cardWidth - 32 }]} />
      {config.headline ? <Text style={styles.headline} numberOfLines={2}>{config.headline}</Text> : null}
      {config.subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{config.subtitle}</Text> : null}
      {config.showBadges ? (
        <View style={styles.badges}>
          <View style={styles.badge} />
          <View style={styles.badge} />
        </View>
      ) : null}
    </SectionShell>
  )
}

export const heroRenderer: NativeSectionRenderer<HeroConfig> = {
  estimateHeight,
  Section: HeroSection,
}

const styles = StyleSheet.create({
  media: { backgroundColor: "#e5e5e5", borderRadius: 8, alignSelf: "center" },
  headline: { fontSize: 18, fontWeight: "600", marginTop: 8 },
  subtitle: { fontSize: 14, color: "#525252", marginTop: 4 },
  badges: { flexDirection: "row", gap: 8, marginTop: 8 },
  badge: { width: 72, height: 24, borderRadius: 12, backgroundColor: "#f5f5f5" },
})
