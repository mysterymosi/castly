import { FlashList } from "@shopify/flash-list"
import {
  CARD_WIDTH,
  estimateSectionHeight,
  PortfolioMediaProvider,
  renderStudioSection,
  type SectionMediaMeta,
} from "@workspace/portfolio-native"
import { readVisibleSections, type TalentSectionDto } from "@workspace/schema"
import { useMemo, useState } from "react"
import { View } from "react-native"

import { logMeasure, takePreviewRequestedAt } from "@/lib/measure"
import { portfolioMediaComponents } from "@/studio/portfolio-media"

type Props = {
  sections: TalentSectionDto[]
  mediaMeta?: SectionMediaMeta
}

export function PortfolioPreview({ sections, mediaMeta = {} }: Props) {
  // Same ordering, migration, and validation as the web page (shared with the parity suite).
  const visible = useMemo(() => readVisibleSections(sections), [sections])
  // Lazy initialisers so the timestamps are read once, on mount.
  const [mountedAt] = useState(() => Date.now())
  const [requestedAt] = useState(() => takePreviewRequestedAt())

  return (
    <View
      className="flex-1 self-center overflow-hidden rounded-xl border border-border bg-surface"
      style={{ width: CARD_WIDTH, maxWidth: "100%", minHeight: 400 }}
    >
      <PortfolioMediaProvider components={portfolioMediaComponents}>
        <FlashList
          data={visible}
          ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
          keyExtractor={(item) => item.id}
          getItemType={(item) => item.type}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
          onLoad={({ elapsedTimeInMs }) => {
            const now = Date.now()
            logMeasure("preview.first_frame", {
              sinceTapMs: requestedAt === null ? null : now - requestedAt,
              sinceMountMs: now - mountedAt,
              listMs: Math.round(elapsedTimeInMs),
              sections: visible.length,
            })
          }}
          renderItem={({ item: section }) => {
            const height = estimateSectionHeight(section, mediaMeta)
            return (
              <View className="self-center overflow-hidden" style={{ height, width: CARD_WIDTH, maxWidth: "100%" }}>
                {renderStudioSection(section, mediaMeta, CARD_WIDTH)}
              </View>
            )
          }}
        />
      </PortfolioMediaProvider>
    </View>
  )
}
