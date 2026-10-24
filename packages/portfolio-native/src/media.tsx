import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react"
import { View } from "react-native"

import type { SectionMediaMeta } from "./types"

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

const PortfolioMediaContext = createContext<PortfolioMediaComponents | null>(
  null
)

export function PortfolioMediaProvider({
  components,
  children,
}: {
  components: PortfolioMediaComponents
  children: ReactNode
}) {
  return (
    <PortfolioMediaContext.Provider value={components}>
      {children}
    </PortfolioMediaContext.Provider>
  )
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
  const components = useContext(PortfolioMediaContext)
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

/** Video for `mediaId`, or `fallback` when there is no playback URL or no provider. */
export function SectionVideo({
  mediaId,
  mediaMeta,
  width,
  height,
  fallback,
}: Omit<MediaSlotProps, "className"> & { fallback: ReactNode }) {
  const components = useContext(PortfolioMediaContext)
  const meta = mediaId ? mediaMeta[mediaId] : undefined
  if (!components || !meta?.playbackUrl) return <>{fallback}</>
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
