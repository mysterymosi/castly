import { Text, View } from "react-native"

import {
  CARD_WIDTH,
  SECTION_HORIZONTAL_PADDING,
  SECTION_TITLE_HEIGHT,
  SECTION_VERTICAL_PADDING,
} from "../constants"
import { heroMediaHeight } from "../layout"
import { SectionImage } from "../media"
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
      <SectionImage
        mediaId={config.mediaId}
        mediaMeta={mediaMeta}
        width={cardWidth - SECTION_HORIZONTAL_PADDING * 2}
        height={mediaHeight}
        className="self-center rounded-lg"
      />
      {config.headline ? (
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} className="mt-2 font-heading text-title-sm text-text">
          {config.headline}
        </Text>
      ) : null}
      {config.subtitle ? (
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} className="mt-1 font-body text-footnote text-textMuted">
          {config.subtitle}
        </Text>
      ) : null}
      {config.showBadges ? (
        <View className="mt-2 flex-row gap-2">
          <View className="h-6 rounded-pill bg-surfaceMuted" style={{ width: 72 }} />
          <View className="h-6 rounded-pill bg-surfaceMuted" style={{ width: 72 }} />
        </View>
      ) : null}
    </SectionShell>
  )
}

export const heroRenderer: NativeSectionRenderer<HeroConfig> = {
  estimateHeight,
  Section: HeroSection,
}
