import type { Message } from "@workspace/schema"
import { Image } from "expo-image"
import type { ReactNode } from "react"
import { Pressable, View } from "react-native"

import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { clockTime, duration } from "@/inbox/format"
import type { MediaViewerParams } from "@/inbox/navigation"
import { cn } from "@/lib/cn"

const TILE_WIDTH = 232
/** Tall media is narrowed so one portrait photo doesn't fill the screen. */
const TILE_MAX_HEIGHT = 280
const white = "#FFFFFF"
const scrim = "rgba(0, 0, 0, 0.45)"

type BubbleProps = {
  item: Message
  mine: boolean
  /** The other side has read up to here (shown on the newest message only). */
  seen: boolean
  /** Continues a run from the same sender: tighter spacing and no tail corner. */
  continuesNewer: boolean
  onOpenMedia: (params: Omit<MediaViewerParams, "title" | "subtitle">) => void
}

/** A tile's size from the media's own shape, kept between portrait 3:4 and landscape 16:9. */
function tileSize(media: Message["media"], fallback: number) {
  const ratio =
    media?.width && media.height ? Math.min(16 / 9, Math.max(3 / 4, media.width / media.height)) : fallback
  return { width: Math.min(TILE_WIDTH, Math.round(TILE_MAX_HEIGHT * ratio)), aspectRatio: ratio }
}

export function MessageBubble({ item, mine, seen, continuesNewer, onOpenMedia }: BubbleProps) {
  const media = item.media
  const photo = item.kind === "image" ? media?.variants?.full : undefined
  const preview = item.kind === "image" ? (media?.variants?.card ?? photo) : undefined
  const playback = item.kind === "video" ? media?.playbackUrl : undefined
  const hasMedia = !!photo || !!playback
  const processing = media?.status === "pending" || media?.status === "processing"
  const unavailable =
    (item.kind === "image" && !photo) ||
    (item.kind === "video" && !playback) ||
    item.kind === "audio" ||
    item.kind === "document"
  const tone = mine ? "onInverse" : "default"

  // On a photo or video the time sits on a dark pill, so it is white in either theme.
  const meta = (overlay: boolean) => {
    const metaStyle = overlay ? { color: white } : undefined
    const metaClass = cn("normal-case tracking-normal", !overlay && "opacity-70")
    return (
      <View className="flex-row items-center gap-1 self-end">
        <Text variant="caption" tone={tone} className={metaClass} style={metaStyle}>
          {clockTime(item.createdAt)}
        </Text>
        {mine && seen ? (
          <Text variant="caption" tone={tone} className={metaClass} style={metaStyle}>
            · Read
          </Text>
        ) : mine ? (
          <View className={overlay ? undefined : "opacity-70"}>
            <Icon name="check" size={11} tone="onInverse" color={overlay ? white : undefined} />
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View className={cn("max-w-[82%]", mine ? "self-end" : "self-start")}>
      <View
        className={cn(
          "overflow-hidden rounded-lg",
          mine ? "bg-inverse" : "bg-surfaceMuted",
          !continuesNewer && (mine ? "rounded-br-sm" : "rounded-bl-sm"),
          hasMedia ? "p-1" : "px-3 py-2"
        )}
        style={{ borderCurve: "continuous" }}
      >
        {photo ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={item.body ? `Photo: ${item.body}` : "Photo"}
            accessibilityHint="Opens the photo full screen"
            onPress={() =>
              onOpenMedia({
                kind: "image",
                uri: photo,
                blurhash: media?.blurhash ?? undefined,
                caption: item.body ?? undefined,
              })
            }
          >
            <Image
              source={preview}
              placeholder={media?.blurhash ? { blurhash: media.blurhash } : undefined}
              contentFit="cover"
              transition={150}
              recyclingKey={item.id}
              style={{ ...tileSize(media, 4 / 3), borderRadius: 12 }}
            />
            {!item.body ? <TimeOverlay>{meta(true)}</TimeOverlay> : null}
          </Pressable>
        ) : null}

        {playback ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              media?.durationMs ? `Play video, ${duration(media.durationMs)}` : "Play video"
            }
            onPress={() =>
              onOpenMedia({
                kind: "video",
                // The MP4 can be kept on the phone; the stream is the fallback until it exists.
                uri: media?.mp4Url ?? playback,
                poster: media?.posterUrl ?? undefined,
                caption: item.body ?? undefined,
              })
            }
          >
            <View
              className="items-center justify-center overflow-hidden bg-inverse"
              style={{ ...tileSize(media, 16 / 9), borderRadius: 12 }}
            >
              {media?.posterUrl ? (
                <Image
                  source={media.posterUrl}
                  placeholder={media.blurhash ? { blurhash: media.blurhash } : undefined}
                  contentFit="cover"
                  recyclingKey={item.id}
                  style={{ position: "absolute", inset: 0 }}
                />
              ) : null}
              <View
                className="items-center justify-center rounded-pill"
                style={{ width: 52, height: 52, backgroundColor: scrim }}
              >
                <Icon name="play" size={22} color={white} />
              </View>
              {media?.durationMs ? (
                <View
                  className="absolute flex-row items-center gap-1 rounded-pill px-2 py-0.5"
                  style={{ left: 8, bottom: 8, backgroundColor: scrim }}
                >
                  <Icon name="video" size={11} color={white} />
                  <Text variant="caption" className="normal-case tracking-normal" style={{ color: white }}>
                    {duration(media.durationMs)}
                  </Text>
                </View>
              ) : null}
            </View>
            {!item.body ? <TimeOverlay>{meta(true)}</TimeOverlay> : null}
          </Pressable>
        ) : null}

        {unavailable ? (
          <View className={cn("flex-row items-center gap-2", hasMedia && "px-2 pt-1")}>
            <Icon name={item.kind === "video" ? "film" : "photo"} size={15} tone={mine ? "onInverse" : "textMuted"} />
            <Text variant="body-sm" tone={tone}>
              {processing ? "Processing attachment…" : "Attachment unavailable"}
            </Text>
          </View>
        ) : null}

        {item.body || !hasMedia ? (
          <View className={cn("gap-0.5", hasMedia && "px-2 pb-1 pt-1.5")}>
            {item.body ? (
              <Text tone={tone} selectable>
                {item.body}
              </Text>
            ) : null}
            {meta(false)}
          </View>
        ) : null}
      </View>
    </View>
  )
}

/** The time over a photo or video with no caption, on a small dark pill. */
function TimeOverlay({ children }: { children: ReactNode }) {
  return (
    <View
      pointerEvents="none"
      className="absolute rounded-pill px-2 py-0.5"
      style={{ right: 8, bottom: 8, backgroundColor: scrim }}
    >
      {children}
    </View>
  )
}

/** "Today", "Yesterday", a weekday or a date between days in a chat. */
export function DayDivider({ label }: { label: string }) {
  return (
    <View className="items-center py-2" accessibilityRole="header">
      <View className="rounded-pill bg-surfaceMuted px-3 py-1">
        <Text variant="footnote" tone="muted">
          {label}
        </Text>
      </View>
    </View>
  )
}
