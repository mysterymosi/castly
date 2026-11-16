import { router } from "expo-router"
import { Image } from "expo-image"
import { useEffect, useMemo, useRef, useState } from "react"
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { ScreenHeader } from "@/components/ui/screen-header"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { clamp, CROP_ASPECT as ASPECT, centred, coverSize, cropRect, MAX_ZOOM, type Framing } from "@/media/crop"
import { takePendingCrop } from "@/media/crop-queue"
import { cropImage } from "@/media/upload"
import { useUploadQueue } from "@/media/upload-queue-provider"

const GUTTER = 20

/**
 * Crop picked photos before they upload (studio photo grid): pinch to zoom, drag to move, inside
 * a fixed 4:5 frame. The file is cut here, so every renderer gets the framing for free; to
 * re-crop, the talent replaces the photo. A photo going into slot 1 (Main) also shows which part
 * of it fills the card's first screen, which is taller than 4:5.
 */
export default function CropScreen() {
  const [job] = useState(() => takePendingCrop())
  const { enqueuePhotos } = useUploadQueue()
  const { color } = useTokens()
  const insets = useSafeAreaInsets()
  const { width: winW, height: winH } = useWindowDimensions()
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const framings = useRef<Framing[]>(job?.images.map(() => ({ ...centred })) ?? [])

  // A reload or a deep link lands here with nothing to crop.
  useEffect(() => {
    if (!job) router.back()
  }, [job])

  // As wide as the screen allows, but never so tall the strip and button fall off.
  const frameW = Math.min(winW - GUTTER * 2, (winH * 0.55) * ASPECT, 560)
  const frameH = frameW / ASPECT

  const zoom = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const start = useSharedValue({ zoom: 1, tx: 0, ty: 0 })

  const image = job?.images[active]
  const cover = image ? coverSize(image, frameW, frameH) : { base: 1, w: frameW, h: frameH }

  const gesture = useMemo(() => {
    const limits = (z: number) => {
      "worklet"
      return { x: Math.max(0, (cover.w * z - frameW) / 2), y: Math.max(0, (cover.h * z - frameH) / 2) }
    }
    const remember = () => {
      "worklet"
      start.set({ zoom: zoom.get(), tx: tx.get(), ty: ty.get() })
    }
    const pan = Gesture.Pan()
      .maxPointers(2)
      .onStart(remember)
      .onUpdate((event) => {
        const max = limits(zoom.get())
        tx.set(clamp(start.get().tx + event.translationX, -max.x, max.x))
        ty.set(clamp(start.get().ty + event.translationY, -max.y, max.y))
      })
    const pinch = Gesture.Pinch()
      .onStart(remember)
      .onUpdate((event) => {
        const z = clamp(start.get().zoom * event.scale, 1, MAX_ZOOM)
        zoom.set(z)
        const max = limits(z)
        tx.set(clamp(tx.get(), -max.x, max.x))
        ty.set(clamp(ty.get(), -max.y, max.y))
      })
    return Gesture.Simultaneous(pan, pinch)
  }, [cover.w, cover.h, frameW, frameH, start, zoom, tx, ty])

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: zoom.get() }],
  }))

  if (!job || !image) return null

  function keep() {
    framings.current[active] = { zoom: zoom.get(), tx: tx.get(), ty: ty.get() }
  }

  function show(index: number) {
    keep()
    const next = framings.current[index] ?? centred
    zoom.set(next.zoom)
    tx.set(next.tx)
    ty.set(next.ty)
    setActive(index)
  }

  function nudgeZoom(factor: number) {
    const z = clamp(zoom.get() * factor, 1, MAX_ZOOM)
    zoom.set(z)
    const maxX = Math.max(0, (cover.w * z - frameW) / 2)
    const maxY = Math.max(0, (cover.h * z - frameH) / 2)
    tx.set(clamp(tx.get(), -maxX, maxX))
    ty.set(clamp(ty.get(), -maxY, maxY))
  }

  async function upload() {
    if (!job) return
    keep()
    setBusy(true)
    setError(null)
    try {
      const uris: string[] = []
      for (const [i, picked] of job.images.entries()) {
        uris.push(await cropImage(picked.uri, cropRect(picked, framings.current[i] ?? centred, frameW, frameH)))
      }
      enqueuePhotos(uris, job.replaceMediaId)
      router.back()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not crop the photo")
      setBusy(false)
    }
  }

  // Main fills the card's first screen, full bleed: as wide as the screen, as tall as it. Of a 4:5
  // crop, only this central share of the width shows there (the rest shows in the photo viewer).
  const isMain = job.firstSlot + active === 0
  const leadAspect = winW / winH
  const mainBand = isMain && leadAspect < ASPECT ? frameW * (leadAspect / ASPECT) : null
  const count = job.images.length

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title={count > 1 ? `Crop photo ${active + 1} of ${count}` : "Crop photo"}
        backIcon="close"
        backLabel="Cancel"
        onBack={() => router.back()}
      />
      <View className="flex-1 items-center gap-5 pt-2">
        <GestureDetector gesture={gesture}>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Photo crop"
            accessibilityHint="Pinch to zoom and drag to move the photo inside the frame"
            accessibilityActions={[
              { name: "increment", label: "Zoom in" },
              { name: "decrement", label: "Zoom out" },
            ]}
            onAccessibilityAction={(event) =>
              nudgeZoom(event.nativeEvent.actionName === "increment" ? 1.25 : 0.8)
            }
            className="overflow-hidden rounded-xl bg-surfaceMuted"
            style={{ width: frameW, height: frameH }}
          >
            {/* Plain views carry the sizes; the animated view only moves (NativeWind interop). */}
            <View
              pointerEvents="none"
              style={{ position: "absolute", left: (frameW - cover.w) / 2, top: (frameH - cover.h) / 2 }}
            >
              <Animated.View style={imageStyle}>
                <Image
                  source={{ uri: image.uri }}
                  recyclingKey={image.uri}
                  contentFit="cover"
                  style={{ width: cover.w, height: cover.h }}
                  accessibilityIgnoresInvertColors
                />
              </Animated.View>
            </View>
            {/* Rule of thirds. */}
            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
              {[1, 2].map((i) => (
                <View
                  key={`v${i}`}
                  style={{ position: "absolute", top: 0, bottom: 0, left: (frameW * i) / 3, width: 1, backgroundColor: "rgba(255,255,255,0.45)" }}
                />
              ))}
              {[1, 2].map((i) => (
                <View
                  key={`h${i}`}
                  style={{ position: "absolute", left: 0, right: 0, top: (frameH * i) / 3, height: 1, backgroundColor: "rgba(255,255,255,0.45)" }}
                />
              ))}
            </View>
            {mainBand !== null ? (
              <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row" }}>
                <View style={{ flex: 1, backgroundColor: "rgba(14,15,19,0.5)" }} />
                <View style={{ width: mainBand, borderLeftWidth: 2, borderRightWidth: 2, borderColor: color.accent }} />
                <View style={{ flex: 1, backgroundColor: "rgba(14,15,19,0.5)" }} />
              </View>
            ) : null}
          </View>
        </GestureDetector>

        <Text variant="footnote" tone="muted" className="px-6 text-center">
          {mainBand !== null
            ? "This is your Main photo. The bright part fills your card's first screen."
            : "Pinch to zoom, drag to move."}
        </Text>

        {count > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 px-5"
            style={{ flexGrow: 0 }}
          >
            {job.images.map((picked, i) => {
              const selected = i === active
              return (
                <Pressable
                  key={picked.uri}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo ${i + 1} of ${count}`}
                  accessibilityState={{ selected }}
                  onPress={() => show(i)}
                  className="overflow-hidden rounded-md"
                  style={{
                    width: 64,
                    height: 80,
                    borderWidth: 2,
                    borderColor: selected ? color.accent : "transparent",
                  }}
                >
                  <Image source={{ uri: picked.uri }} contentFit="cover" style={{ width: 60, height: 76 }} />
                  {selected ? (
                    <View className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-pill bg-accent">
                      <Icon name="check" size={11} tone="onAccent" />
                    </View>
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>
        ) : null}
        {error ? <InlineError message={error} className="mx-5" /> : null}
      </View>
      <View className="px-5" style={{ paddingBottom: insets.bottom + 12 }}>
        <Button
          label={job.replaceMediaId ? "Replace" : count > 1 ? `Upload ${count} photos` : "Upload"}
          loading={busy}
          disabled={busy}
          onPress={() => void upload()}
        />
      </View>
    </View>
  )
}
