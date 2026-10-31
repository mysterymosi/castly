import type { DeckCard as DeckCardData } from "@workspace/schema"
import { shadow } from "@workspace/ui-tokens"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { View, type LayoutChangeEvent } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  makeMutable,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"

import { Button } from "@/components/ui/button"
import { Icon, type IconName } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { cardId, DeckCard, DeckCardPreview } from "@/deck/deck-card"
import { useDeckPrefetch } from "@/deck/prefetch"
import { haptics } from "@/lib/haptics"
import { logMeasure, takeDeckOpenedAt } from "@/lib/measure"

export type DeckDecision = "pass" | "interested" | "save"

/** A card commits past ~a quarter of the width, or on a flick regardless of distance. */
const COMMIT_FRACTION = 0.28
const FLICK_VELOCITY = 900
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
const CARD_GUTTER = 12
const ACTION_ROW_HEIGHT = 64
const ACTION_ROW_GAP = 10
/** Ask for the next page when this many cards are left: enough for the 5-card prefetch ahead. */
const NEAR_END = 5

/**
 * Both cards occupy the same slot, stacked. Positioning lives on a plain View; the Animated.View
 * inside carries only the animated transform. NativeWind's interop on Reanimated's Animated.View
 * (`components/ui/animated.ts`) drops layout styles that arrive alongside an animated style, which
 * laid the two cards out one above the other.
 */
const cardSlot = { position: "absolute", left: CARD_GUTTER, top: 0 } as const

/** A card's drag offset. Each card owns one, so the card that takes the top starts at rest. */
type Motion = { x: SharedValue<number>; y: SharedValue<number> }

type Props = {
  cards: DeckCardData[]
  /** Called once a card has left the screen. M5 5.9 records the swipe here. */
  onDecision: (decision: DeckDecision, card: DeckCardData) => void
  onShare: (card: DeckCardData) => void
  onRestart: () => void
  /** Called as the booker nears the last loaded card; the session loads its next page. */
  onNearEnd?: () => void
  /** Nothing more to serve: past the last card, show the end of the deck. */
  exhausted?: boolean
  /** The next page failed; past the last card, offer to retry instead of waiting. */
  loadMoreError?: string | null
}

/**
 * The deck: the focused card on top (whole portfolio, scrollable), the next two behind it
 * (decision layer only: photo and caption, no list, no video), and images for the cards after
 * that warming in the cache (`useDeckPrefetch`). Gestures follow TECH_SPEC §10.1 and run on the UI thread throughout:
 *
 * - The swipe activates after 15px horizontally and fails after 10px vertically, so the first
 *   significant movement claims the axis for the whole gesture.
 * - The card's scroll view waits for the swipe to fail before it scrolls, so a horizontal drag
 *   never scrolls and a vertical scroll never swipes.
 * - A touch that lands while the list is still coasting after a fling never becomes a swipe.
 *
 * Cards are keyed by talent, so the card behind stays mounted as it takes the top: its photo is
 * already on screen, and its full portfolio fades in over it only once laid out. Sharing one
 * offset across cards left the new top card a frame at the old one's off-screen position, which
 * flashed the card after it.
 */
export function SwipeDeck({
  cards,
  onDecision,
  onShare,
  onRestart,
  onNearEnd,
  exhausted = true,
  loadMoreError = null,
}: Props) {
  const reduceMotion = useReducedMotion()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [index, setIndex] = useState(0)
  const exiting = useRef(false)
  // One offset per card (cheap: two numbers each), kept for the life of the deck: a page that
  // arrives mid-swipe adds offsets for its cards and never replaces the moving one.
  const [motionStore] = useState(() => new Map<string, Motion>())
  const motions = useMemo(() => {
    for (const c of cards) {
      if (!motionStore.has(cardId(c))) motionStore.set(cardId(c), { x: makeMutable(0), y: makeMutable(0) })
    }
    return motionStore
  }, [cards, motionStore])
  const scrollMomentum = useSharedValue(false)

  const current = cards[index]
  const next = cards[index + 1]
  const afterNext = cards[index + 2]
  useDeckPrefetch(cards, index)
  const width = size ? size.width - CARD_GUTTER * 2 : 0
  // The floating action row sits just under the card: across its edge it covered the Highlights
  // card, which is the first screen's cue to scroll.
  const height = size ? size.height - ACTION_ROW_HEIGHT - ACTION_ROW_GAP * 2 : 0
  const offscreen = (size?.width ?? 0) * 1.5

  const top = current ? (motions.get(cardId(current)) ?? null) : null

  useEffect(() => {
    exiting.current = false
    scrollMomentum.set(false)
  }, [index, scrollMomentum])

  useEffect(() => {
    if (cards.length - index <= NEAR_END) onNearEnd?.()
  }, [cards.length, index, onNearEnd])

  // §25 timings (logged only when measuring): first card from Discover opening, and each
  // card-to-card transition from the moment the old card has left to the new one fully mounted.
  const committedAt = useRef<number | null>(null)
  const onCardShown = useCallback((shownIndex: number) => {
    const now = Date.now()
    if (shownIndex === 0) {
      const openedAt = takeDeckOpenedAt()
      if (openedAt !== null) logMeasure("deck.first_card", { sinceOpenMs: now - openedAt })
      return
    }
    if (committedAt.current === null) return
    logMeasure("deck.transition", { ms: now - committedAt.current, index: shownIndex })
    committedAt.current = null
  }, [])

  const advance = useCallback(
    (decision: DeckDecision) => {
      const card = cards[index]
      if (card) onDecision(decision, card)
      committedAt.current = Date.now()
      setIndex((i) => i + 1)
    },
    [cards, index, onDecision],
  )

  /** Buttons and accessibility actions: the same exit as a swipe, without a finger. */
  const exit = useCallback(
    (decision: DeckDecision) => {
      if (!top || exiting.current) return
      exiting.current = true
      haptics.tap()
      const timing = { duration: reduceMotion ? 120 : 240, easing: EASE_OUT }
      const done = (finished?: boolean) => {
        "worklet"
        if (finished) scheduleOnRN(advance, decision)
      }
      if (decision === "save") top.y.set(withTiming(-height * 1.2, timing, done))
      else top.x.set(withTiming((decision === "interested" ? 1 : -1) * offscreen, timing, done))
    },
    [top, reduceMotion, height, offscreen, advance],
  )

  function onLayout(event: LayoutChangeEvent) {
    const { width: w, height: h } = event.nativeEvent.layout
    setSize((s) => (s && s.width === w && s.height === h ? s : { width: w, height: h }))
  }

  return (
    <View className="flex-1">
      <View className="flex-1" onLayout={onLayout}>
        {size && current && top ? (
          <>
            {/* Back to front, so the focused card draws last; keys keep each card mounted as it moves up. */}
            {[afterNext, next, current].map((card, i) => {
              if (!card) return null
              const isTop = card === current
              return (
                <DeckSlot
                  key={cardId(card)}
                  card={card}
                  isTop={isTop}
                  depth={2 - i}
                  testID={isTop ? `deck-card-${index}` : undefined}
                  motion={motions.get(cardId(card))!}
                  leader={card === next ? top : null}
                  width={width}
                  height={height}
                  reduceMotion={reduceMotion}
                  offscreen={offscreen}
                  onCommit={advance}
                  scrollMomentum={scrollMomentum}
                  onShare={() => onShare(card)}
                  onAction={exit}
                  onShown={isTop ? () => onCardShown(index) : undefined}
                />
              )
            })}
            <FloatingActions
              top={height + ACTION_ROW_GAP}
              onPass={() => exit("pass")}
              onSave={() => exit("save")}
              onInterested={() => exit("interested")}
            />
          </>
        ) : null}
        {size && !current && !exhausted ? (
          loadMoreError ? (
            <ErrorState message={loadMoreError} onRetry={onNearEnd} />
          ) : (
            <LoadingState label="Finding more talent" />
          )
        ) : null}
        {size && !current && exhausted ? (
          // A restart opens a new session; the screen keys the deck by it, so it remounts fresh.
          <DeckEnd onRestart={onRestart} />
        ) : null}
      </View>
    </View>
  )
}

/**
 * One card in the stack. Behind, it shows the decision layer only; the next card scales up as the
 * top card leaves (`leader` is the top card's offset). On top, it follows its own offset and mounts the
 * full portfolio over the decision layer, revealed once the portfolio has laid out and its photo
 * is on screen, so taking the top never blinks.
 */
function DeckSlot({
  card,
  isTop,
  depth,
  testID,
  motion,
  leader,
  width,
  height,
  reduceMotion,
  offscreen,
  scrollMomentum,
  onCommit,
  onShare,
  onAction,
  onShown,
}: {
  card: DeckCardData
  isTop: boolean
  /** 0 on top, 1 next, 2 the one after. */
  depth: number
  testID?: string
  motion: Motion
  leader: Motion | null
  width: number
  height: number
  reduceMotion: boolean
  offscreen: number
  scrollMomentum: SharedValue<boolean>
  /** Called once a swiped card has left the screen. */
  onCommit: (decision: DeckDecision) => void
  onShare: () => void
  onAction: (decision: DeckDecision) => void
  /** The full card is on screen (its portfolio laid out, its photo shown). */
  onShown?: () => void
}) {
  const [ready, setReady] = useState(false)

  // Each card owns its pan, a worklet gesture from mount and enabled only on top. Handing the top
  // card a different gesture than it mounted with (a plain one behind, the worklet one on top)
  // left its detector on the plain wrapper, and the second card never swiped.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isTop)
        .activeOffsetX([-15, 15])
        .failOffsetY([-10, 10])
        .onTouchesDown((_event, manager) => {
          if (scrollMomentum.get()) manager.fail()
        })
        .onUpdate((event) => {
          motion.x.set(event.translationX)
        })
        .onEnd((event) => {
          const flick = Math.abs(event.velocityX) > FLICK_VELOCITY
          const far = Math.abs(event.translationX) > width * COMMIT_FRACTION
          const direction = Math.sign(flick ? event.velocityX : event.translationX)
          if ((flick || far) && direction !== 0) {
            scheduleOnRN(haptics.tap)
            motion.x.set(
              withSpring(
                direction * offscreen,
                { duration: 300, dampingRatio: 1, velocity: event.velocityX, overshootClamping: true },
                (finished) => {
                  if (finished) scheduleOnRN(onCommit, direction > 0 ? "interested" : "pass")
                },
              ),
            )
          } else {
            motion.x.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: event.velocityX }))
          }
        }),
    [isTop, motion, width, offscreen, onCommit, scrollMomentum],
  )
  const scrollGesture = useMemo(() => Gesture.Native().requireExternalGestureToFail(pan), [pan])

  const style = useAnimatedStyle(() => {
    // Two back: rests where the next card starts, hidden behind it.
    if (depth === 2) return { transform: [{ scale: reduceMotion ? 1 : 0.95 }] }
    if (leader) {
      if (reduceMotion || width === 0) return { transform: [{ scale: 1 }] }
      const progress = Math.min(
        1,
        Math.abs(leader.x.get()) / (width * 0.6) + Math.abs(leader.y.get()) / (height * 0.6),
      )
      return { transform: [{ scale: 0.95 + 0.05 * progress }] }
    }
    return {
      transform: [
        { translateX: motion.x.get() },
        { translateY: motion.y.get() },
        { rotateZ: reduceMotion || width === 0 ? "0deg" : `${(motion.x.get() / width) * 8}deg` },
      ],
    }
  })

  return (
    // testID marks the deck position for UI tests (`.maestro/discover-deck.yaml`).
    <View
      style={[cardSlot, { width, height, zIndex: 3 - depth }]}
      testID={testID}
      pointerEvents={isTop ? "auto" : "none"}
      importantForAccessibility={isTop ? "auto" : "no-hide-descendants"}
      accessibilityElementsHidden={!isTop}
    >
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[{ width, height }, style]}
          accessibilityActions={
            isTop
              ? [
                  { name: "pass", label: "Pass" },
                  { name: "interested", label: "Interested" },
                  { name: "save", label: "Save for later" },
                ]
              : undefined
          }
          onAccessibilityAction={(event) => onAction(event.nativeEvent.actionName as DeckDecision)}
        >
          {!ready ? (
            <View style={{ position: "absolute", top: 0, left: 0 }}>
              <DeckCardPreview card={card} width={width} height={height} />
            </View>
          ) : null}
          {isTop ? (
            <View style={{ position: "absolute", top: 0, left: 0, opacity: ready ? 1 : 0 }}>
              <DeckCard
                card={card}
                width={width}
                height={height}
                scrollGesture={scrollGesture}
                scrollMomentum={scrollMomentum}
                onShare={onShare}
                onReady={() => {
                  setReady(true)
                  onShown?.()
                }}
              />
            </View>
          ) : null}
          {isTop ? (
            <>
              <Stamp side="pass" translateX={motion.x} width={width} />
              <Stamp side="interested" translateX={motion.x} width={width} />
            </>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

/** After the last card: a fanned stack, a line of copy, and a way back to the start. */
function DeckEnd({ onRestart }: { onRestart: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(240)} style={{ flex: 1, justifyContent: "center" }}>
      <View className="items-center px-8">
        <View style={{ width: 168, height: 176, alignItems: "center", justifyContent: "center" }}>
          <View
            className="absolute rounded-lg border border-border bg-surfaceMuted"
            style={{ width: 104, height: 140, transform: [{ rotate: "-10deg" }, { translateX: -26 }] }}
          />
          <View
            className="absolute rounded-lg border border-border bg-surfaceMuted"
            style={{ width: 104, height: 140, transform: [{ rotate: "10deg" }, { translateX: 26 }] }}
          />
          <View
            className="items-center justify-center rounded-lg border border-border bg-surface"
            style={{ width: 112, height: 148, boxShadow: shadow.card }}
          >
            <View className="h-14 w-14 items-center justify-center rounded-pill bg-interested">
              <Icon name="check" size={26} tone="onInterested" />
            </View>
          </View>
        </View>
        <Text variant="title" className="mt-8 text-center">
          You’re all caught up
        </Text>
        <Text variant="body" tone="muted" className="mt-2 text-center" style={{ maxWidth: 300 }}>
          You’ve seen everyone in this deck. New talent joins every day, so check back soon.
        </Text>
        <Button label="Start over" icon="refresh" size="md" onPress={onRestart} className="mt-8 px-8" />
      </View>
    </Animated.View>
  )
}

/** PASS / INTERESTED label that fades in as the card is dragged toward that side. */
function Stamp({
  side,
  translateX,
  width,
}: {
  side: "pass" | "interested"
  translateX: SharedValue<number>
  width: number
}) {
  const pass = side === "pass"
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.get(),
      pass ? [-width * COMMIT_FRACTION, 0] : [0, width * COMMIT_FRACTION],
      pass ? [1, 0] : [0, 1],
      Extrapolation.CLAMP,
    ),
  }))
  return (
    // Below the progress bars and the share button, tilted like a rubber stamp.
    <View
      pointerEvents="none"
      style={[
        { position: "absolute", top: 64, transform: [{ rotate: pass ? "12deg" : "-12deg" }] },
        pass ? { right: 20 } : { left: 20 },
      ]}
    >
      <Animated.View style={style}>
        <View
          className={`rounded-md border-[3px] px-3 py-1.5 ${pass ? "border-passText" : "border-interestedText"}`}
          style={{ backgroundColor: "rgba(255, 255, 255, 0.92)" }}
        >
          <Text variant="title-sm" tone={pass ? "pass" : "interested"} style={{ letterSpacing: 1.5 }}>
            {pass ? "PASS" : "INTERESTED"}
          </Text>
        </View>
      </Animated.View>
    </View>
  )
}

function ActionButton({
  icon,
  label,
  onPress,
  tone,
  large,
}: {
  icon: IconName
  label: string
  onPress: () => void
  tone: "pass" | "interested" | "neutral"
  large?: boolean
}) {
  return (
    <PressableScale
      // The exit fires its own haptic at the moment the card commits; one per action.
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`items-center justify-center rounded-pill ${large ? "h-16 w-16" : "h-12 w-12"} ${
        tone === "interested" ? "bg-interested" : "bg-surface"
      }`}
      style={{ boxShadow: shadow.raised }}
    >
      <Icon
        name={icon}
        size={large ? 28 : 20}
        tone={tone === "pass" ? "passText" : tone === "interested" ? "onInterested" : "text"}
      />
    </PressableScale>
  )
}

/**
 * Pass / Save / Interested float just under the card (PRD §7.2.1: reachable at any scroll depth),
 * as raised circles rather than a bar. Share lives on the photo and at the portfolio's end.
 */
function FloatingActions({
  top,
  onPass,
  onSave,
  onInterested,
}: {
  top: number
  onPass: () => void
  onSave: () => void
  onInterested: () => void
}) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
      }}
    >
      <ActionButton icon="close" label="Pass" tone="pass" large onPress={onPass} />
      <ActionButton icon="bookmark" label="Save for later" tone="neutral" onPress={onSave} />
      <ActionButton icon="check" label="Interested" tone="interested" large onPress={onInterested} />
    </View>
  )
}
