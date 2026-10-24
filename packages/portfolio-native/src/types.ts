import type { CoreSectionConfigMap, CoreSectionType, PortfolioSection } from "@workspace/schema"
import type { ReactElement } from "react"

export type { CoreSectionConfigMap, CoreSectionType }

export type SectionMediaMeta = Record<
  string,
  {
    width?: number
    height?: number
    durationMs?: number
    /** Card-width image variant (images only). */
    imageUrl?: string | null
    /** Poster frame (videos only). */
    posterUrl?: string | null
    /** HLS manifest (videos only). */
    playbackUrl?: string | null
    blurhash?: string | null
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
