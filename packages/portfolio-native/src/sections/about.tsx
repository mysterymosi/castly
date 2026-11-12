import { selectAbout } from "@workspace/schema"
import { Text } from "react-native"

import { CARD_WIDTH, DEFAULT_HERO_ASPECT, SECTION_HORIZONTAL_PADDING, SECTION_TITLE_HEIGHT } from "../constants"
import { estimateTextBlockHeight, mediaHeightForWidth } from "../layout"
import { SectionImage } from "../media"
import { SectionShell, SectionTitle } from "../section-shell"
import type {
  CoreSectionConfigMap,
  NativeSectionRenderer,
  PortfolioContent,
  SectionMediaMeta,
  SectionRendererProps,
} from "../types"

type AboutConfig = CoreSectionConfigMap["about"]

export function estimateHeight(
  config: AboutConfig,
  mediaMeta: SectionMediaMeta,
  content?: PortfolioContent
): number {
  let h = SECTION_TITLE_HEIGHT + 24
  const { body } = selectAbout(config, content ?? {})
  h += estimateTextBlockHeight(body ?? undefined, CARD_WIDTH - 32, 20, 42, 8)
  if (config.mediaId) {
    h += mediaHeightForWidth(config.mediaId, CARD_WIDTH - 32, mediaMeta, DEFAULT_HERO_ASPECT) + 8
  }
  return h + 24
}

function AboutSection({ config, mediaMeta, content, cardWidth = CARD_WIDTH }: SectionRendererProps<AboutConfig>) {
  const { body } = selectAbout(config, content ?? {})
  const inner = cardWidth - SECTION_HORIZONTAL_PADDING * 2
  const mediaH = config.mediaId
    ? mediaHeightForWidth(config.mediaId, inner, mediaMeta, DEFAULT_HERO_ASPECT)
    : 0
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>About</SectionTitle>
      {body ? (
        <Text
          numberOfLines={8}
          maxFontSizeMultiplier={1.3}
          className="font-bodyMedium text-text"
          style={{ fontSize: 14, lineHeight: 20 }}
        >
          {body}
        </Text>
      ) : null}
      {config.mediaId ? (
        <SectionImage
          mediaId={config.mediaId}
          mediaMeta={mediaMeta}
          width={inner}
          height={mediaH}
          className="mt-2 rounded-lg"
        />
      ) : null}
    </SectionShell>
  )
}

export const aboutRenderer: NativeSectionRenderer<AboutConfig> = {
  estimateHeight,
  Section: AboutSection,
}
