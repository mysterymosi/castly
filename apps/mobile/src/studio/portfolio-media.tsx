import type {
  PortfolioImageProps,
  PortfolioMediaComponents,
  PortfolioVideoProps,
  SectionMediaMeta,
} from "@workspace/portfolio-native"
import type { StudioState } from "@workspace/schema"
import { useEvent } from "expo"
import { Image } from "expo-image"
import { useVideoPlayer, VideoView } from "expo-video"
import { useState } from "react"
import { Pressable, View } from "react-native"

import { Icon } from "@/components/ui/icon"

/** Renderer media meta from the studio media map: card variant for images, poster + HLS for video. */
export function mediaMetaFromStudio(
  media: StudioState["media"]
): SectionMediaMeta {
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

function PortfolioImage({ uri, blurhash, width, height }: PortfolioImageProps) {
  return (
    <Image
      source={{ uri }}
      placeholder={blurhash ? { blurhash } : undefined}
      recyclingKey={uri}
      contentFit="cover"
      transition={150}
      style={{ width, height }}
      accessibilityIgnoresInvertColors
    />
  )
}

/**
 * HLS showreel. The player gets its source on mount, so the manifest and first segments load
 * with the preview (the 2.10 measurement includes that cost). Poster and a play button sit on top
 * until the first play; native controls take over after that.
 */
function PortfolioVideo({
  playbackUrl,
  posterUrl,
  width,
  height,
}: PortfolioVideoProps) {
  const player = useVideoPlayer({ uri: playbackUrl, contentType: "hls" })
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  })
  const [started, setStarted] = useState(false)
  const showCover = !started && !isPlaying

  return (
    <View style={{ width, height }}>
      <VideoView
        player={player}
        contentFit="cover"
        nativeControls={started}
        fullscreenOptions={{ enable: true }}
        style={{ width, height }}
      />
      {showCover ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play showreel"
          onPress={() => {
            setStarted(true)
            player.play()
          }}
          className="absolute inset-0 items-center justify-center"
        >
          {posterUrl ? (
            <Image
              source={{ uri: posterUrl }}
              contentFit="cover"
              style={{ position: "absolute", width, height }}
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <View className="rounded-pill h-12 w-12 items-center justify-center bg-accent">
            <Icon name="play" size={20} tone="onAccent" />
          </View>
        </Pressable>
      ) : null}
    </View>
  )
}

export const portfolioMediaComponents: PortfolioMediaComponents = {
  Image: PortfolioImage,
  Video: PortfolioVideo,
}
