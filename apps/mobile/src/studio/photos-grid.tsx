import { PHOTO_SLOTS, type StudioState } from "@workspace/schema"
import { router } from "expo-router"
import { Image } from "expo-image"
import { useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"

import { Icon } from "@/components/ui/icon"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { haptics } from "@/lib/haptics"
import { setPendingCrop } from "@/media/crop-queue"
import { pickImageAssets } from "@/media/upload"
import { isIntentActive } from "@/media/upload-intent"
import { useUploadQueue } from "@/media/upload-queue-provider"
import { studioApi } from "@/studio/api"
import { useStudio } from "@/studio/studio-provider"

const COLS = 3
const GAP = 10
/** Portrait tiles, like the card's photos. */
const TILE_ASPECT = 5 / 4
/** Screen gutters either side of the grid. */
const GUTTER = 20

type Geometry = { tileW: number; tileH: number }

function slotOrigin(index: number, { tileW, tileH }: Geometry) {
  return {
    x: (index % COLS) * (tileW + GAP),
    y: Math.floor(index / COLS) * (tileH + GAP),
  }
}

function Badge({ label }: { label: string }) {
  return (
    <View
      pointerEvents="none"
      className="rounded-pill absolute bottom-2 left-2 min-w-7 items-center px-2 py-0.5"
      style={{ backgroundColor: "rgba(14, 15, 19, 0.6)" }}
    >
      <Text variant="footnote" style={{ color: "#FFFFFF" }}>
        {label}
      </Text>
    </View>
  )
}

/**
 * A filled slot. Press and hold, then drag, to move it; it lands in the slot under the finger and
 * the others close up around it. Slot 1 is "Main", the card's lead.
 */
function PhotoTile({
  mediaId,
  index,
  count,
  uri,
  processing,
  geometry,
  disabled,
  onMove,
  replacing,
  onOptions,
}: {
  mediaId: string
  index: number
  count: number
  uri: string | null
  processing: boolean
  geometry: Geometry
  disabled: boolean
  onMove: (from: number, to: number) => void
  /** A replacement is uploading into this slot. */
  replacing: boolean
  /** Replace or remove, after asking. */
  onOptions: () => void
}) {
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const lifted = useSharedValue(0)
  // Raises the dragged tile over its neighbours. Kept in React state on the plain wrapper:
  // NativeWind's interop drops plain styles that sit beside an animated one.
  const [dragging, setDragging] = useState(false)
  const { x, y } = slotOrigin(index, geometry)
  const { tileW, tileH } = geometry

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && count > 1)
        .activateAfterLongPress(220)
        .onStart(() => {
          lifted.set(withSpring(1, { duration: 180 }))
          scheduleOnRN(setDragging, true)
          scheduleOnRN(haptics.selection)
        })
        .onUpdate((event) => {
          tx.set(event.translationX)
          ty.set(event.translationY)
        })
        .onEnd((event) => {
          const col = Math.round((x + event.translationX) / (tileW + GAP))
          const row = Math.round((y + event.translationY) / (tileH + GAP))
          const clampedCol = Math.min(COLS - 1, Math.max(0, col))
          const target = Math.min(
            count - 1,
            Math.max(0, row * COLS + clampedCol)
          )
          if (target !== index) scheduleOnRN(onMove, index, target)
        })
        .onTouchesCancelled(() => {
          tx.set(0)
          ty.set(0)
          lifted.set(withSpring(0, { duration: 180 }))
          scheduleOnRN(setDragging, false)
        })
        .onFinalize(() => {
          tx.set(0)
          ty.set(0)
          lifted.set(withSpring(0, { duration: 180 }))
          scheduleOnRN(setDragging, false)
        }),
    [disabled, count, index, x, y, tileW, tileH, onMove, tx, ty, lifted]
  )

  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.get() },
      { translateY: ty.get() },
      { scale: 1 + lifted.get() * 0.06 },
    ],
  }))

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: tileW,
        height: tileH,
        zIndex: dragging ? 10 : 1,
      }}
    >
      <GestureDetector gesture={pan}>
        {/* Transform only: sizes live on the plain View inside (see `dragging`). */}
        <Animated.View
          style={dragStyle}
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            index === 0
              ? `Main photo, 1 of ${count}`
              : `Photo ${index + 1} of ${count}`
          }
          accessibilityHint="Hold and drag to reorder"
          accessibilityActions={[
            ...(index > 0
              ? [{ name: "moveEarlier", label: "Move earlier" }]
              : []),
            ...(index < count - 1
              ? [{ name: "moveLater", label: "Move later" }]
              : []),
            ...(index > 0
              ? [{ name: "makeMain", label: "Make main photo" }]
              : []),
            { name: "options", label: "Replace or remove" },
          ]}
          onAccessibilityAction={(event) => {
            const action = event.nativeEvent.actionName
            if (action === "moveEarlier") onMove(index, index - 1)
            else if (action === "moveLater") onMove(index, index + 1)
            else if (action === "makeMain") onMove(index, 0)
            else if (action === "options") onOptions()
          }}
        >
          <View style={{ width: tileW, height: tileH }}>
            <View
              className="bg-surfaceMuted overflow-hidden rounded-lg"
              style={{ width: tileW, height: tileH }}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  recyclingKey={mediaId}
                  contentFit="cover"
                  style={{ width: tileW, height: tileH }}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View
                  className="items-center justify-center"
                  style={{ width: tileW, height: tileH }}
                >
                  {processing ? (
                    <ActivityIndicator />
                  ) : (
                    <Icon name="photo" size={22} tone="textMuted" />
                  )}
                </View>
              )}
            </View>
            {replacing ? (
              <View
                pointerEvents="none"
                className="absolute inset-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: "rgba(14, 15, 19, 0.55)" }}
                accessibilityLabel="Replacing photo"
              >
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : null}
            <Badge label={index === 0 ? "Main" : String(index + 1)} />
          </View>
        </Animated.View>
      </GestureDetector>
      {/* Outside the drag gesture, so holding it never starts a drag. */}
      {dragging ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            index === 0 ? "Main photo options" : `Photo ${index + 1} options`
          }
          accessibilityHint="Replace or remove this photo"
          disabled={disabled || replacing}
          onPress={onOptions}
          hitSlop={8}
          className="rounded-pill absolute top-1.5 right-1.5 h-8 w-8 items-center justify-center active:opacity-70"
          style={{ backgroundColor: "rgba(14, 15, 19, 0.75)" }}
        >
          <Icon name="close" size={14} color="#FFFFFF" />
        </Pressable>
      )}
    </Animated.View>
  )
}

/**
 * The talent's photos (`talent_photos`), as six slots. Their order is the card's order: Main leads
 * and the rest are spread between the portfolio's sections, wherever the sections fall; the
 * talent arranges only the photos, not where they land.
 */
export function PhotosGrid({ state }: { state: StudioState }) {
  const { run, pending } = useStudio()
  const { intents, retry, dismiss } = useUploadQueue()
  const { color } = useTokens()
  const { width } = useWindowDimensions()
  // While a reorder or removal saves, the grid shows the new order instead of snapping back.
  const [optimistic, setOptimistic] = useState<string[] | null>(null)

  const gridW = Math.min(width, 600) - GUTTER * 2
  const tileW = (gridW - GAP * (COLS - 1)) / COLS
  const geometry = { tileW, tileH: tileW * TILE_ASPECT }
  const rows = Math.ceil(PHOTO_SLOTS / COLS)

  const ids = optimistic ?? state.talent.photoMediaIds
  const active = intents.filter(
    (row) => row.goal === "photo" && isIntentActive(row)
  )
  // A replacement uploads into its photo's slot; only new photos take a slot of their own.
  const uploading = active.filter((row) => !row.replaceMediaId)
  const replacing = new Set(
    active.flatMap((row) => (row.replaceMediaId ? [row.replaceMediaId] : []))
  )
  const failed = intents.filter(
    (row) => row.goal === "photo" && row.phase === "failed"
  )
  const free = Math.max(0, PHOTO_SLOTS - ids.length - uploading.length)
  const saving = pending === "photos"

  async function save(next: string[]) {
    setOptimistic(next)
    await run(
      "photos",
      () => studioApi.setPhotos(next),
      "Could not save your photos"
    )
    setOptimistic(null)
  }

  /** Picks photos and opens the crop screen, which uploads them once cropped. */
  async function cropNew(
    max: number,
    firstSlot: number,
    replaceMediaId?: string
  ) {
    const images = await pickImageAssets(max)
    if (images.length === 0) return
    setPendingCrop({ images, firstSlot, replaceMediaId })
    router.push("/studio/crop")
  }

  /** Replace or remove, never removed by one stray tap. */
  function confirmOptions(mediaId: string, index: number) {
    const which = index === 0 ? "your Main photo" : `photo ${index + 1}`
    Alert.alert(
      index === 0 ? "Main photo" : `Photo ${index + 1}`,
      index === 0 && ids.length > 1
        ? "If you remove it, photo 2 becomes your Main photo."
        : undefined,
      [
        { text: "Replace", onPress: () => void cropNew(1, index, mediaId) },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            Alert.alert(`Remove ${which}?`, undefined, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Remove",
                style: "destructive",
                onPress: () => void save(ids.filter((id) => id !== mediaId)),
              },
            ]),
        },
        { text: "Cancel", style: "cancel" },
      ]
    )
  }

  function move(from: number, to: number) {
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    void save(next)
  }

  return (
    <View className="gap-3">
      <View
        style={{
          width: gridW,
          height: rows * geometry.tileH + (rows - 1) * GAP,
        }}
      >
        {ids.map((mediaId, index) => {
          const media = state.media[mediaId]
          return (
            <PhotoTile
              key={mediaId}
              mediaId={mediaId}
              index={index}
              count={ids.length}
              uri={media?.variants?.thumb ?? media?.variants?.card ?? null}
              processing={
                !media ||
                media.status === "processing" ||
                media.status === "pending"
              }
              geometry={geometry}
              disabled={saving}
              onMove={move}
              replacing={replacing.has(mediaId)}
              onOptions={() => confirmOptions(mediaId, index)}
            />
          )
        })}
        {uploading.map((row, i) => {
          const { x, y } = slotOrigin(ids.length + i, geometry)
          return (
            <View
              key={row.id}
              className="bg-surfaceMuted absolute items-center justify-center rounded-lg"
              style={{
                left: x,
                top: y,
                width: geometry.tileW,
                height: geometry.tileH,
              }}
              accessibilityLabel="Photo uploading"
            >
              <ActivityIndicator color={color.text} />
            </View>
          )
        })}
        {Array.from({ length: free }, (_, i) => {
          const slot = ids.length + uploading.length + i
          const { x, y } = slotOrigin(slot, geometry)
          return (
            <Pressable
              key={`empty-${slot}`}
              accessibilityRole="button"
              accessibilityLabel={
                slot === 0 ? "Add your main photo" : `Add photo ${slot + 1}`
              }
              onPress={() => void cropNew(free, ids.length + uploading.length)}
              className="border-borderStrong absolute items-center justify-center rounded-lg border-2 border-dashed active:opacity-70"
              style={{
                left: x,
                top: y,
                width: geometry.tileW,
                height: geometry.tileH,
              }}
            >
              <Icon name="plus" size={26} />
              <Badge label={slot === 0 ? "Main" : String(slot + 1)} />
            </Pressable>
          )
        })}
      </View>
      <Text variant="footnote" tone="muted">
        {ids.length > 1
          ? "Hold and drag to reorder. Main leads your card; the rest show between your sections."
          : "Main leads your card; the rest show between your sections."}
      </Text>
      {failed.map((row) => (
        <View key={row.id} className="flex-row items-center gap-3">
          <InlineError
            message={row.error ?? "A photo didn't upload"}
            className="flex-1"
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => retry(row.id)}
            hitSlop={8}
          >
            <Text variant="label">Retry</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => dismiss(row.id)}
            hitSlop={8}
          >
            <Text variant="label" tone="muted">
              Dismiss
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  )
}
