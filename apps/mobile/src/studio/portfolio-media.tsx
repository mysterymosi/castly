import {
  mediaMetaFromStatus,
  type PortfolioImageProps,
  type PortfolioMediaComponents,
  type PortfolioVideoProps,
  type SectionMediaMeta,
} from "@workspace/portfolio-native"
import type { StudioState } from "@workspace/schema"
import { useEvent } from "expo"
import { Image } from "expo-image"
import { useVideoPlayer, VideoView } from "expo-video"
import { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Pressable, View } from "react-native"

import { Icon } from "@/components/ui/icon"
import { useTokens } from "@/hooks/use-tokens"
import { lowestRendition, useDataSaver } from "@/media/data-saver"

/** Renderer media meta from the studio media map: card variant for images, poster + HLS for video. */
export function mediaMetaFromStudio(
  media: StudioState["media"]
): SectionMediaMeta {
  return mediaMetaFromStatus(media)
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

// Live HLS players. The deck allows one at a time (TECH_SPEC §10.2); dev builds warn on a second.
let livePlayers = 0

/**
 * HLS showreel. The player gets its source on mount, so the manifest and first segments load
 * with the preview (the 2.10 measurement includes that cost). Poster and a play button sit on top
 * until the first play; native controls take over after that. With data-saver on, nothing loads
 * until the tap, and then only the lowest rendition (TECH_SPEC §10.3).
 */
function PortfolioVideo(props: PortfolioVideoProps) {
  const dataSaver = useDataSaver()
  // A fresh player per mode: switching mid-load must not keep the other mode's source or state.
  return <ShowreelPlayer key={dataSaver ? "saver" : "full"} {...props} dataSaver={dataSaver} />
}

function ShowreelPlayer({
  playbackUrl,
  posterUrl,
  width,
  height,
  dataSaver,
}: PortfolioVideoProps & { dataSaver: boolean }) {
  const { color } = useTokens()
  const onAccent = color.onAccent
  const source = useMemo(
    () => ({ uri: dataSaver ? lowestRendition(playbackUrl) : playbackUrl, contentType: "hls" as const }),
    [dataSaver, playbackUrl],
  )
  const player = useVideoPlayer(dataSaver ? null : source)
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  })
  const [started, setStarted] = useState(false)
  // Data-saver loads the stream on tap; the poster stays up until the first frame plays.
  const [loading, setLoading] = useState(false)
  if (loading && isPlaying) setLoading(false)
  const showCover = (!started && !isPlaying) || loading

  useEffect(() => {
    livePlayers += 1
    if (__DEV__ && livePlayers > 1) console.warn(`[media] ${livePlayers} HLS players mounted; expected one`)
    return () => {
      livePlayers -= 1
    }
  }, [])

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
          accessibilityState={{ busy: loading }}
          disabled={loading}
          onPress={() => {
            setStarted(true)
            if (dataSaver) {
              setLoading(true)
              void player
                .replaceAsync(source)
                .then(() => player.play())
                .catch(() => setLoading(false))
            } else player.play()
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
            {loading ? <ActivityIndicator color={onAccent} /> : <Icon name="play" size={20} tone="onAccent" />}
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
