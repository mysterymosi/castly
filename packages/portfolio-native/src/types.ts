import type { CoreSectionConfigMap, CoreSectionType, PortfolioSection } from "@workspace/schema"
import type { ReactElement } from "react"

export type { CoreSectionConfigMap, CoreSectionType }

export type SectionMediaMeta = Record<
  string,
  {
    width?: number
    height?: number
    durationMs?: number
  }
>

export type SectionRendererProps<TConfig> = {
  config: TConfig
  mediaMeta: SectionMediaMeta
  cardWidth?: number
}

export type NativeSectionRenderer<TConfig> = {
  estimateHeight: (config: TConfig, mediaMeta: SectionMediaMeta) => number
  Section: (props: SectionRendererProps<TConfig>) => ReactElement
}

export type StudioSectionRegistry = {
  [K in CoreSectionType]: NativeSectionRenderer<CoreSectionConfigMap[K]>
}

export type { PortfolioSection }
