import type {
  CoreSectionConfigMap,
  CoreSectionType,
  PortfolioContent,
  PortfolioSection,
} from "@workspace/schema"
import type { ComponentType, ReactElement } from "react"

export type { CoreSectionConfigMap, CoreSectionType, PortfolioContent, PortfolioSection }

/** Ready media referenced by the sections, keyed by media id. */
export type PortfolioMediaMeta = Record<
  string,
  {
    width?: number
    height?: number
    /** 480×640 scale-down image variant. */
    cardUrl?: string | null
    /** 2048 scale-down image variant. */
    fullUrl?: string | null
    /** Poster frame (videos only). */
    posterUrl?: string | null
    /** HLS manifest (videos only). */
    playbackUrl?: string | null
  }
>

export type PortfolioImageProps = {
  src: string
  srcSet?: string
  sizes?: string
  alt: string
  width?: number
  height?: number
  className?: string
  priority?: boolean
}

export type PortfolioVideoProps = {
  playbackUrl: string
  posterUrl?: string | null
  title: string
  className?: string
  /** Muted autoplay loop (hero `video_loop`) instead of a click-to-play player. */
  loop?: boolean
}

/** Override the default `<img>` / `<video>` elements, e.g. with an hls.js client component. */
export type PortfolioMediaComponents = {
  Image: ComponentType<PortfolioImageProps>
  Video: ComponentType<PortfolioVideoProps>
}

export type PortfolioRenderContext = {
  mediaMeta: PortfolioMediaMeta
  content: PortfolioContent
  components: PortfolioMediaComponents
  /** Reference date for the availability horizon. */
  now: Date
}

export type WebSectionProps<TConfig> = {
  config: TConfig
  context: PortfolioRenderContext
}

/** Returns null when the section has nothing to show, so the public page never renders an empty shell. */
export type WebSectionRenderer<TConfig> = (
  props: WebSectionProps<TConfig>
) => ReactElement | null

export type WebSectionRegistry = {
  [K in CoreSectionType]: WebSectionRenderer<CoreSectionConfigMap[K]>
}
