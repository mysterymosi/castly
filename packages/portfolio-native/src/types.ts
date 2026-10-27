import type {
  CoreSectionConfigMap,
  CoreSectionType,
  PortfolioContent,
  PortfolioSection,
} from "@workspace/schema"
import type { ReactElement } from "react"

export type { CoreSectionConfigMap, CoreSectionType, PortfolioContent }

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
  /**
   * Rows for the list sections, already filtered for the viewer. Absent in the studio preview,
   * where list sections draw placeholder rows; present on the public card and in parity tests.
   */
  content?: PortfolioContent
  /** Reference date for the availability horizon. */
  now?: Date
}

export type NativeSectionRenderer<TConfig> = {
  estimateHeight: (
    config: TConfig,
    mediaMeta: SectionMediaMeta,
    content?: PortfolioContent,
    now?: Date
  ) => number
  Section: (props: SectionRendererProps<TConfig>) => ReactElement
}

export type StudioSectionRegistry = {
  [K in CoreSectionType]: NativeSectionRenderer<CoreSectionConfigMap[K]>
}

export type { PortfolioSection }
