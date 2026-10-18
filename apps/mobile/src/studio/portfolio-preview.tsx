import { FlashList } from "@shopify/flash-list"
import {
  CARD_WIDTH,
  estimateSectionHeight,
  renderStudioSection,
  type SectionMediaMeta,
} from "@workspace/portfolio-native"
import type { PortfolioSection, StudioState } from "@workspace/schema"
import { useMemo } from "react"
import { StyleSheet, View } from "react-native"

type Props = {
  sections: StudioState["sections"]
  mediaMeta?: SectionMediaMeta
}

function toPortfolioSection(section: StudioState["sections"][number]): PortfolioSection {
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
    <View style={styles.frame}>
      <FlashList
        data={visible}
        keyExtractor={(item) => item.id}
        getItemType={(item) => item.type}
        renderItem={({ item }) => {
          const section = toPortfolioSection(item)
          const height = estimateSectionHeight(section, mediaMeta)
          return (
            <View style={[styles.row, { height, width: CARD_WIDTH }]}>
              {renderStudioSection(section, mediaMeta, CARD_WIDTH)}
            </View>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    width: CARD_WIDTH,
    maxWidth: "100%",
    alignSelf: "center",
    minHeight: 400,
    flex: 1,
    overflow: "hidden",
  },
  row: {
    maxWidth: "100%",
    alignSelf: "center",
    overflow: "hidden",
  },
})
