import type {
  CoreSectionConfigMap,
  CoreSectionType,
  PortfolioSection,
  TalentRateDto,
} from "@workspace/schema"
import type { ComponentType, ReactElement } from "react"

export type { CoreSectionConfigMap, CoreSectionType, PortfolioSection }

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

/**
 * Profile data the list sections display. Section configs only carry display options, so the
 * page loader supplies the rows. Everything here is already filtered for the viewer: a missing
 * `rates` means the viewer may not see rates, and the rates section renders nothing.
 */
export type PortfolioContent = {
  credits?: {
    title: string
    roleName?: string | null
    productionCompany?: string | null
    year?: number | null
    type?: string | null
    link?: string | null
    isSignature: boolean
    verified: boolean
  }[]
  attributes?: { label: string; value: string }[]
  skills?: { name: string }[]
  languages?: { name: string; fluency?: string | null }[]
  accents?: { name: string }[]
  rates?: TalentRateDto[]
  /** `month` is `YYYY-MM`. */
  availability?: { month: string; status: "available" | "partial" | "booked" }[]
}

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
