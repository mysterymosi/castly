import { Text, View } from "react-native"

import { CARD_WIDTH, DEFAULT_HERO_ASPECT, SECTION_HORIZONTAL_PADDING, SECTION_TITLE_HEIGHT } from "../constants"
import { estimateTextBlockHeight, mediaHeightForWidth } from "../layout"
import { SectionShell, SectionTitle } from "../section-shell"
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
  const inner = cardWidth - SECTION_HORIZONTAL_PADDING * 2
  const mediaH = config.mediaId
    ? mediaHeightForWidth(config.mediaId, inner, mediaMeta, DEFAULT_HERO_ASPECT)
    : 0
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>About</SectionTitle>
      {config.body ? (
        <Text
          numberOfLines={8}
          maxFontSizeMultiplier={1.3}
          className="font-body text-text"
          style={{ fontSize: 14, lineHeight: 20 }}
        >
          {config.body}
        </Text>
      ) : null}
      {config.mediaId ? (
        <View className="mt-2 rounded-lg bg-surfaceMuted" style={{ height: mediaH, width: inner }} />
      ) : null}
    </SectionShell>
  )
}

export const aboutRenderer: NativeSectionRenderer<AboutConfig> = {
  estimateHeight,
  Section: AboutSection,
}
