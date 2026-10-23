import { FlashList } from "@shopify/flash-list"
import {
  CARD_WIDTH,
  estimateSectionHeight,
  renderStudioSection,
  type SectionMediaMeta,
} from "@workspace/portfolio-native"
import type { PortfolioSection, TalentSectionDto } from "@workspace/schema"
import { useMemo } from "react"
import { View } from "react-native"

type Props = {
  sections: TalentSectionDto[]
  mediaMeta?: SectionMediaMeta
}

function toPortfolioSection(section: TalentSectionDto): PortfolioSection {
  return {
    type: section.type,
    schemaVersion: section.schemaVersion,
    config: section.config,
  } as PortfolioSection
}

export function PortfolioPreview({ sections, mediaMeta = {} }: Props) {
  const visible = useMemo(
    () => sections.filter((s) => s.isVisible).sort((a, b) => a.position - b.position),
    [sections],
  )

  return (
    <View
      className="flex-1 self-center overflow-hidden rounded-xl border border-border bg-surface"
      style={{ width: CARD_WIDTH, maxWidth: "100%", minHeight: 400 }}
    >
      <FlashList
        data={visible}
        ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.type}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => {
          const section = toPortfolioSection(item)
          const height = estimateSectionHeight(section, mediaMeta)
          return (
            <View className="self-center overflow-hidden" style={{ height, width: CARD_WIDTH, maxWidth: "100%" }}>
              {renderStudioSection(section, mediaMeta, CARD_WIDTH)}
            </View>
          )
        }}
      />
    </View>
  )
}
