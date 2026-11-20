import { useEvent } from "expo"
import { Image } from "expo-image"
import { StatusBar } from "expo-status-bar"
import { useVideoPlayer, VideoView } from "expo-video"
import { useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  useWindowDimensions,
  View,
} from "react-native"
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler"
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { scheduleOnRN } from "react-native-worklets"

import { Icon } from "@/components/ui/icon"
import type { MediaViewerParams } from "@/inbox/navigation"

const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5
const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 900
const white = "#FFFFFF"
const whiteMuted = "rgba(255, 255, 255, 0.72)"
const scrim = "rgba(0, 0, 0, 0.45)"

/**
 * A chat photo or video on black, edge to edge. The top bar names the sender and time; a caption
 * sits at the bottom. A tap hides both. Photos pinch and double-tap to zoom, and a downward swipe
 * closes the viewer when the photo isn't zoomed. Videos play at once with the platform's controls.
 */
export function MediaViewer({
  params,
  onClose,
}: {
  params: MediaViewerParams
  onClose: () => void
}) {
  const [chrome, setChrome] = useState(true)
  const insets = useSafeAreaInsets()

  // A native modal is its own view tree, so it needs its own gesture-handler root.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" hidden={!chrome} animated />
      {params.kind === "image" ? (
        <ZoomableImage
          uri={params.uri}
          blurhash={params.blurhash}
          onDismiss={onClose}
          onToggleChrome={() => setChrome((shown) => !shown)}
        />
      ) : (
        <ViewerVideo
          uri={params.uri}
          poster={params.poster}
          topInset={insets.top + 60}
        />
      )}
      {chrome ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top,
            // Over a photo the name needs the same dark wash as the caption; a video has its own
            // black above the picture.
            backgroundColor: params.kind === "image" ? scrim : undefined,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 8,
              minHeight: 56,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: scrim,
              }}
            >
              <Icon name="close" size={20} color={white} />
            </Pressable>
            <View style={{ flex: 1 }}>
              {params.title ? (
                <RNText
                  numberOfLines={1}
                  className="font-bodyBold text-body"
                  style={{ color: white }}
                >
                  {params.title}
                </RNText>
              ) : null}
              {params.subtitle ? (
                <RNText
                  numberOfLines={1}
                  className="font-bodyMedium text-footnote"
                  style={{ color: whiteMuted }}
                >
                  {params.subtitle}
                </RNText>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}
      {chrome && params.caption && params.kind === "image" ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            backgroundColor: scrim,
          }}
        >
          <RNText
            selectable
            className="font-bodyMedium text-body"
            style={{ color: white }}
          >
            {params.caption}
          </RNText>
        </View>
      ) : null}
    </GestureHandlerRootView>
  )
}

function ZoomableImage({
  uri,
  blurhash,
  onDismiss,
  onToggleChrome,
}: {
  uri: string
  blurhash?: string
  onDismiss: () => void
  onToggleChrome: () => void
}) {
  const { width, height } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const [failed, setFailed] = useState(false)
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const savedX = useSharedValue(0)
  const savedY = useSharedValue(0)
  // How far an unzoomed photo has been dragged towards closing; the black behind it fades.
  const dismissY = useSharedValue(0)

  const settle = (to: number) => {
    "worklet"
    return reduceMotion
      ? withTiming(to, { duration: 0 })
      : withSpring(to, { damping: 20, stiffness: 220 })
  }
  // How far a zoomed photo may move before its edge leaves the screen's edge.
  const bound = (offset: number, size: number, zoom: number) => {
    "worklet"
    const max = (size * zoom - size) / 2
    return Math.min(max, Math.max(-max, offset))
  }
  // Moves to (toX, toY) at `zoom` and remembers it as the resting place for the next gesture.
  const restAt = (zoom: number, toX: number, toY: number) => {
    "worklet"
    scale.set(settle(zoom))
    savedScale.set(zoom)
    x.set(settle(toX))
    y.set(settle(toY))
    savedX.set(toX)
    savedY.set(toY)
  }

  // Shared values use get() and set(), the form Reanimated asks for under the React Compiler.
  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.set(
        Math.min(MAX_SCALE, Math.max(0.8, savedScale.get() * event.scale))
      )
    })
    .onEnd(() => {
      const zoom = scale.get()
      if (zoom <= 1) restAt(1, 0, 0)
      else
        restAt(zoom, bound(x.get(), width, zoom), bound(y.get(), height, zoom))
    })

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((event) => {
      if (savedScale.get() > 1) {
        x.set(savedX.get() + event.translationX)
        y.set(savedY.get() + event.translationY)
      } else {
        dismissY.set(event.translationY)
      }
    })
    .onEnd((event) => {
      const zoom = savedScale.get()
      if (zoom > 1) {
        restAt(zoom, bound(x.get(), width, zoom), bound(y.get(), height, zoom))
        return
      }
      if (
        Math.abs(event.translationY) > DISMISS_DISTANCE ||
        Math.abs(event.velocityY) > DISMISS_VELOCITY
      ) {
        scheduleOnRN(onDismiss)
      } else {
        dismissY.set(settle(0))
      }
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (savedScale.get() > 1) {
        restAt(1, 0, 0)
        return
      }
      // Zoom towards the tapped point.
      restAt(
        DOUBLE_TAP_SCALE,
        bound(
          (width / 2 - event.x) * (DOUBLE_TAP_SCALE - 1),
          width,
          DOUBLE_TAP_SCALE
        ),
        bound(
          (height / 2 - event.y) * (DOUBLE_TAP_SCALE - 1),
          height,
          DOUBLE_TAP_SCALE
        )
      )
    })

  const singleTap = Gesture.Tap()
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => scheduleOnRN(onToggleChrome))

  const gesture = Gesture.Simultaneous(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap)
  )

  // Layout lives inside the animated styles: here a plain style beside a Reanimated one on the
  // same view is dropped, which left the photo with no size at all.
  const backdrop = useAnimatedStyle(() => ({
    position: "absolute",
    top: 0,
    left: 0,
    width,
    height,
    backgroundColor: "#000",
    opacity: 1 - (Math.min(Math.abs(dismissY.get()), 400) / 400) * 0.75,
  }))
  const style = useAnimatedStyle(() => {
    const drag = Math.min(Math.abs(dismissY.get()), 400) / 400
    return {
      width,
      height,
      transform: [
        { translateX: x.get() },
        { translateY: y.get() + dismissY.get() },
        { scale: scale.get() * (1 - drag * 0.15) },
      ],
    }
  })

  if (failed) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
        }}
      >
        <Icon name="warning" size={28} color={white} />
        <RNText
          className="font-bodyMedium text-body"
          style={{ color: white, textAlign: "center" }}
        >
          This photo could not be loaded.
        </RNText>
      </View>
    )
  }

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1 }}>
        <Animated.View style={backdrop} />
        <Animated.View
          style={style}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Photo. Double tap to zoom."
        >
          <Image
            source={uri}
            placeholder={blurhash ? { blurhash } : undefined}
            contentFit="contain"
            transition={150}
            style={{ flex: 1 }}
            onError={() => setFailed(true)}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  )
}

function ViewerVideo({
  uri,
  poster,
  topInset,
}: {
  uri: string
  poster?: string
  topInset: number
}) {
  // Kept on the phone after the first watch, so opening it again plays at once (WhatsApp-style).
  // iOS can only cache a plain file, not an HLS stream; Android caches either.
  const useCaching = /\.mp4(\?|$)/.test(uri) || process.env.EXPO_OS === "android"
  const player = useVideoPlayer({ uri, useCaching }, (video) => {
    video.play()
  })
  const { status } = useEvent(player, "statusChange", { status: player.status })

  return (
    <View style={{ flex: 1, paddingTop: topInset }}>
      <VideoView
        player={player}
        style={{ flex: 1 }}
        contentFit="contain"
        nativeControls
        fullscreenOptions={{ enable: true }}
        accessibilityLabel="Video"
      />
      {status === "loading" || status === "error" ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          {poster && status === "loading" ? (
            <Image
              source={poster}
              contentFit="contain"
              style={{ position: "absolute", inset: 0 }}
            />
          ) : null}
          {status === "loading" ? (
            <ActivityIndicator color={white} size="large" />
          ) : (
            <>
              <Icon name="warning" size={28} color={white} />
              <RNText
                className="font-bodyMedium text-body"
                style={{ color: white }}
              >
                This video could not be played.
              </RNText>
            </>
          )}
        </View>
      ) : null}
    </View>
  )
}
