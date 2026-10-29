import {
  createContext,
  useContext,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react"
import type { MediaStatusOutput } from "@workspace/schema"
import { View } from "react-native"

import type { SectionMediaMeta } from "./types"

/** Renderer media meta from media status rows: card variant for images, poster + HLS for video. */
export function mediaMetaFromStatus(media: Record<string, MediaStatusOutput>): SectionMediaMeta {
  const meta: SectionMediaMeta = {}
  for (const [id, item] of Object.entries(media)) {
    meta[id] = {
      width: item.width ?? undefined,
      height: item.height ?? undefined,
      durationMs: item.durationMs ?? undefined,
      imageUrl: item.variants?.card ?? null,
      posterUrl: item.posterUrl,
      playbackUrl: item.playbackUrl,
      blurhash: item.blurhash,
    }
  }
  return meta
}

export type PortfolioImageProps = {
  uri: string
  blurhash?: string | null
  width: number
  height: number
}

export type PortfolioVideoProps = {
  playbackUrl: string
  posterUrl?: string | null
  width: number
  height: number
}

/**
 * Media components the host app supplies (expo-image / expo-video on native). Keeping them
 * injected leaves this package free of native media dependencies.
 */
export type PortfolioMediaComponents = {
  Image: ComponentType<PortfolioImageProps>
  Video: ComponentType<PortfolioVideoProps>
}

/** Opens a gallery's photos full screen, starting at `index`. */
export type OpenGalleryImage = (mediaIds: string[], index: number) => void

type PortfolioMediaValue = {
  components: PortfolioMediaComponents
  onOpenImage?: OpenGalleryImage
}

const PortfolioMediaContext = createContext<PortfolioMediaValue | null>(null)

export function PortfolioMediaProvider({
  components,
  onOpenImage,
  children,
}: {
  components: PortfolioMediaComponents
  /** When set, gallery photos are tappable and open through this. */
  onOpenImage?: OpenGalleryImage
  children: ReactNode
}) {
  const value = useMemo(() => ({ components, onOpenImage }), [components, onOpenImage])
  return (
    <PortfolioMediaContext.Provider value={value}>
      {children}
    </PortfolioMediaContext.Provider>
  )
}

export function useOpenGalleryImage(): OpenGalleryImage | undefined {
  return useContext(PortfolioMediaContext)?.onOpenImage
}

type MediaSlotProps = {
  mediaId: string | null | undefined
  mediaMeta: SectionMediaMeta
  width: number
  height: number
  className?: string
}

/** Image for `mediaId`, or the muted placeholder when there is no URL or no provider. */
export function SectionImage({
  mediaId,
  mediaMeta,
  width,
  height,
  className = "rounded-lg",
}: MediaSlotProps) {
  const components = useContext(PortfolioMediaContext)?.components
  const meta = mediaId ? mediaMeta[mediaId] : undefined
  return (
    <View
      className={`bg-surfaceMuted overflow-hidden ${className}`}
      style={{ width, height }}
    >
      {components && meta?.imageUrl ? (
        <components.Image
          uri={meta.imageUrl}
          blurhash={meta.blurhash}
          width={width}
          height={height}
        />
      ) : null}
    </View>
  )
}

const PortfolioVideoGateContext = createContext(true)

/**
 * Whether videos under it may mount a player. A host with several videos on screen (the deck)
 * gates all but one, so only one HLS player exists and nothing off-screen downloads a stream;
 * gated videos show their poster. Ungated by default.
 */
export function PortfolioVideoGate({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <PortfolioVideoGateContext.Provider value={active}>
      {children}
    </PortfolioVideoGateContext.Provider>
  )
}

/**
 * Video for `mediaId`; its poster while gated (see `PortfolioVideoGate`); `fallback` when there
 * is no playback URL or no provider.
 */
export function SectionVideo({
  mediaId,
  mediaMeta,
  width,
  height,
  fallback,
}: Omit<MediaSlotProps, "className"> & { fallback: ReactNode }) {
  const components = useContext(PortfolioMediaContext)?.components
  const active = useContext(PortfolioVideoGateContext)
  const meta = mediaId ? mediaMeta[mediaId] : undefined
  if (!components || !meta?.playbackUrl) return <>{fallback}</>
  if (!active) {
    if (!meta.posterUrl) return <>{fallback}</>
    return (
      <View
        className="bg-inverse overflow-hidden rounded-lg"
        style={{ width, height }}
      >
        <components.Image
          uri={meta.posterUrl}
          blurhash={meta.blurhash}
          width={width}
          height={height}
        />
      </View>
    )
  }
  return (
    <View
      className="bg-inverse overflow-hidden rounded-lg"
      style={{ width, height }}
    >
      <components.Video
        playbackUrl={meta.playbackUrl}
        posterUrl={meta.posterUrl}
        width={width}
        height={height}
      />
    </View>
  )
}
