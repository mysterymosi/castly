import { Text, View } from "react-native"

import { CARD_WIDTH, SECTION_HORIZONTAL_PADDING, SECTION_TITLE_HEIGHT } from "../constants"
import { showreelMediaHeight } from "../layout"
import { SectionVideo } from "../media"
import { SectionShell, SectionTitle } from "../section-shell"
import type { CoreSectionConfigMap, NativeSectionRenderer, SectionMediaMeta } from "../types"

type ShowreelConfig = CoreSectionConfigMap["showreel"]

export function estimateHeight(config: ShowreelConfig, mediaMeta: SectionMediaMeta): number {
  const mediaH = showreelMediaHeight(config.mediaId, CARD_WIDTH, mediaMeta)
  return SECTION_TITLE_HEIGHT + mediaH + (config.headline ? 28 : 0) + 24
}

function ShowreelSection({ config, mediaMeta, cardWidth = CARD_WIDTH }: { config: ShowreelConfig; mediaMeta: SectionMediaMeta; cardWidth?: number }) {
  const mediaH = showreelMediaHeight(config.mediaId, cardWidth, mediaMeta)
  const mediaWidth = cardWidth - SECTION_HORIZONTAL_PADDING * 2
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>Showreel</SectionTitle>
      <SectionVideo
        mediaId={config.mediaId}
        mediaMeta={mediaMeta}
        width={mediaWidth}
        height={mediaH}
        fallback={
          <View
            className="items-center justify-center rounded-lg bg-inverse"
            style={{ height: mediaH, width: mediaWidth }}
            accessibilityLabel={config.mediaId ? "Showreel video" : "No showreel yet"}
          >
            <View className="h-12 w-12 items-center justify-center rounded-pill bg-accent">
              <View
                style={{
                  width: 0,
                  height: 0,
                  marginLeft: 4,
                  borderTopWidth: 9,
                  borderBottomWidth: 9,
                  borderLeftWidth: 14,
                  borderTopColor: "transparent",
                  borderBottomColor: "transparent",
                }}
                className="border-l-onAccent"
              />
            </View>
          </View>
        }
      />
      {config.headline ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className="mt-2 font-body text-textMuted"
          style={{ fontSize: 14, lineHeight: 20 }}
        >
          {config.headline}
        </Text>
      ) : null}
    </SectionShell>
  )
}

export const showreelRenderer: NativeSectionRenderer<ShowreelConfig> = {
  estimateHeight,
  Section: ShowreelSection,
}
