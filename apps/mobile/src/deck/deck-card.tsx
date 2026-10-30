import { FlashList, type FlashListRef, type ViewToken } from "@shopify/flash-list"
import {
  mediaMetaFromStatus,
  PortfolioMediaProvider,
  PortfolioVideoGate,
  renderStudioSection,
} from "@workspace/portfolio-native"
import {
  portfolioContentFromDto,
  readVisibleSections,
  type DeckCard as DeckCardData,
  type PortfolioSection,
} from "@workspace/schema"
import { shadow } from "@workspace/ui-tokens"
import { Image } from "expo-image"
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react"
import { Pressable, ScrollView, View, type ScrollViewProps } from "react-native"
import { GestureDetector, type Gesture } from "react-native-gesture-handler"
import type { SharedValue } from "react-native-reanimated"

import { Button } from "@/components/ui/button"
import { Tag } from "@/components/ui/chip"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { ImageViewer, type ImageViewerState } from "@/deck/image-viewer"
import { useFrameMeter } from "@/lib/frame-meter"
import { portfolioMediaComponents } from "@/studio/portfolio-media"

type NativeGesture = ReturnType<typeof Gesture.Native>

type Item =
  | { kind: "lead"; key: string }
  | { kind: "section"; key: string; section: PortfolioSection }
  | { kind: "depth"; key: string }
  | { kind: "end"; key: string }

const SECTION_INSET = 12
/** Inset of the caption and Highlights card from the photo's edges. */
const OVERLAY_INSET = 16
/** Longest the deck waits for a card's photo before revealing it anyway (slow network, failed load). */
const REVEAL_TIMEOUT_MS = 600
/** A showreel plays only while at least half of its section is on screen (TECH_SPEC §10.2). */
const VIDEO_VIEWABILITY = { itemVisiblePercentThreshold: 50 }

/** Dark scrim behind text laid over a photo; a CSS gradient, so no native gradient module. */
const photoScrim = {
  experimental_backgroundImage:
    "linear-gradient(to bottom, rgba(14, 15, 19, 0) 0%, rgba(14, 15, 19, 0.35) 45%, rgba(14, 15, 19, 0.82) 100%)",
} as const

/** Crew, production and events cards open on the work, not the headshot (PRD §7.2.1). */
export function opensMidPortfolio(card: DeckCardData) {
  const kind = card.decision.categoryKind
  return kind !== null && kind !== "on_camera"
}

export function cardId(card: DeckCardData) {
  return card.talent.profile.userId
}

export function mediaUri(card: DeckCardData, id: string) {
  const media = card.media[id]
  return media?.variants?.card ?? media?.posterUrl ?? null
}

/** Name, category, place, age range and signature credit, laid over the photo's lower third. */
function PhotoCaption({ card }: { card: DeckCardData }) {
  const { profile } = card.talent
  const { decision } = card
  const age = decision.ageRange
  const ageText =
    age && (age.min !== null || age.max !== null)
      ? `Plays ${[age.min, age.max].filter((n) => n !== null).join("–")}`
      : null
  const meta = [decision.categoryName, profile.cityName, ageText].filter(Boolean).join(" · ")
  const signature = decision.signatureCredit
  const creditLine = signature
    ? [
        signature.title,
        signature.roleName,
        signature.year ? String(signature.year) : null,
        decision.creditCount > 1 ? `+${decision.creditCount - 1} more` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return (
    <View className="gap-1.5" pointerEvents="none">
      <Text variant="display-sm" tone="onInverse" numberOfLines={2} maxFontSizeMultiplier={1.2}>
        {profile.displayName}
      </Text>
      {meta ? (
        <Text variant="body" tone="onInverse" numberOfLines={1} style={{ opacity: 0.9 }}>
          {meta}
        </Text>
      ) : null}
      {creditLine ? (
        <View className="flex-row items-center gap-2" style={{ opacity: 0.9 }}>
          <Icon name="film" size={16} tone="onInverse" />
          <Text variant="body-sm" tone="onInverse" numberOfLines={1} className="flex-1">
            {creditLine}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/** White card inside the bottom of the photo with the talent's highlight facts; none without facts. */
function HighlightsCard({ card }: { card: DeckCardData }) {
  const facts = card.talent.profile.cardConfig.highlightFacts
  if (facts.length === 0) return null
  return (
    <View className="gap-3 rounded-lg bg-surface p-4" style={{ boxShadow: shadow.card }}>
      <Text variant="body-strong">Highlights</Text>
      <View className="flex-row flex-wrap gap-2">
        {facts.map((fact) => (
          <Tag key={fact} label={fact} />
        ))}
      </View>
    </View>
  )
}

/**
 * The first screen of a card: the lead photo fills it, full bleed (tap left / right to step
 * through up to five — a horizontal pager would fight the deck's swipe), with the caption and the
 * Highlights card stacked inside its bottom over a scrim. The portfolio continues below.
 */
function LeadBlock({
  card,
  width,
  height,
  interactive,
  onShare,
  onPhotoShown,
}: {
  card: DeckCardData
  width: number
  height: number
  interactive: boolean
  onShare?: () => void
  onPhotoShown?: () => void
}) {
  const ids = card.decision.leadMediaIds
  const [index, setIndex] = useState(0)
  const id = ids[Math.min(index, ids.length - 1)]
  const uri = id ? mediaUri(card, id) : null
  const blurhash = id ? card.media[id]?.blurhash : null
  const photoHeight = height

  return (
    <View className="items-center" style={{ width }}>
      <View className="overflow-hidden bg-surfaceMuted" style={{ width, height: photoHeight }}>
        {uri ? (
          <Image
            source={{ uri }}
            placeholder={blurhash ? { blurhash } : undefined}
            recyclingKey={uri}
            contentFit="cover"
            // On the focused card the photo replaces the preview's copy already on screen; a fade
            // would flash the placeholder between them.
            transition={interactive ? 0 : 120}
            style={{ width, height: photoHeight }}
            onDisplay={onPhotoShown}
            onError={onPhotoShown}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View className="flex-1 items-center justify-center" pointerEvents="none">
            <Icon name="person" size={56} tone="textMuted" />
          </View>
        )}
        <View
          pointerEvents="none"
          style={[{ position: "absolute", left: 0, right: 0, bottom: 0, height: photoHeight * 0.6 }, photoScrim]}
        />
        {interactive && ids.length > 1 ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row" }}>
            <Pressable
              style={{ flex: 1 }}
              accessibilityRole="button"
              accessibilityLabel="Previous photo"
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
            />
            <Pressable
              style={{ flex: 1 }}
              accessibilityRole="button"
              accessibilityLabel="Next photo"
              onPress={() => setIndex((i) => Math.min(ids.length - 1, i + 1))}
            />
          </View>
        ) : null}
        {ids.length > 1 ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 10, left: 12, right: 12, flexDirection: "row", gap: 4 }}
          >
            {ids.map((mediaId, i) => (
              <View
                key={mediaId}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 1.5,
                  backgroundColor: i === index ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.38)",
                  // Keeps the bars legible over a pale photo.
                  boxShadow: "0px 0px 2px rgba(14, 15, 19, 0.3)",
                }}
              />
            ))}
          </View>
        ) : null}
        {interactive && onShare ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share ${card.talent.profile.displayName}'s portfolio`}
            onPress={onShare}
            hitSlop={8}
            style={{
              position: "absolute",
              top: 28,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(14, 15, 19, 0.45)",
            }}
          >
            <Icon name="share" size={18} tone="onInverse" />
          </Pressable>
        ) : null}
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: OVERLAY_INSET,
            right: OVERLAY_INSET,
            bottom: OVERLAY_INSET,
            gap: 16,
          }}
        >
          <View style={{ paddingHorizontal: 4 }}>
            <PhotoCaption card={card} />
          </View>
          <HighlightsCard card={card} />
        </View>
      </View>
    </View>
  )
}

/** After the last section: share again, for a booker who read to the end. */
function EndOfPortfolio({ onShare }: { onShare: () => void }) {
  return (
    <View className="items-center px-6 pb-8 pt-6">
      <Button label="Share portfolio" variant="secondary" size="md" icon="share" onPress={onShare} />
    </View>
  )
}

/** Next card in the stack: the first screen only, no scroll list and no media players (TECH_SPEC §10.2). */
export function DeckCardPreview({ card, width, height }: { card: DeckCardData; width: number; height: number }) {
  return (
    <View
      className="overflow-hidden rounded-lg bg-surfaceMuted"
      style={{ width, height, boxShadow: shadow.card }}
    >
      <LeadBlock card={card} width={width} height={height} interactive={false} />
    </View>
  )
}

const ScrollGestureContext = createContext<NativeGesture | null>(null)

/**
 * The card's scroll view, wrapped in the native gesture the deck's swipe coordinates with. A
 * module-level component (FlashList needs a stable `renderScrollComponent`) reading the gesture
 * from context.
 */
function DeckScrollView({ ref, ...props }: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  const gesture = use(ScrollGestureContext)
  const scroll = <ScrollView ref={ref} {...props} />
  return gesture ? <GestureDetector gesture={gesture}>{scroll}</GestureDetector> : scroll
}

/**
 * Stands in for the sections until the booker first scrolls: muted blocks, no media, so the list
 * has room to scroll into.
 */
function DepthPlaceholder({ width, sectionWidth }: { width: number; sectionWidth: number }) {
  return (
    <View className="items-center gap-3 pt-3" style={{ width }} accessibilityElementsHidden>
      {[180, 140].map((h) => (
        <View key={h} className="rounded-lg bg-surface" style={{ width: sectionWidth, height: h, opacity: 0.6 }} />
      ))}
    </View>
  )
}

/**
 * The focused card: the whole portfolio as one virtualised list — the lead block, then each
 * section as a rounded card in the talent's studio order. Only this card mounts the list, and
 * (TECH_SPEC §10.2) its sections — the depth layer — mount on the first scroll, not on focus;
 * crew cards, which open on their work, mount them at once. At most one showreel has a player:
 * the first one at least half on screen. Everything else shows posters.
 */
export function DeckCard({
  card,
  width,
  height,
  scrollGesture,
  scrollMomentum,
  onShare,
  onReady,
}: {
  card: DeckCardData
  width: number
  height: number
  scrollGesture: NativeGesture
  /** Set while the list coasts after a fling; the deck ignores swipes that start then. */
  scrollMomentum: SharedValue<boolean>
  onShare: () => void
  /** Called once, when the list has laid out and the lead photo is on screen. */
  onReady?: () => void
}) {
  const listRef = useRef<FlashListRef<Item>>(null)
  const openedMid = useRef(false)
  const [viewer, setViewer] = useState<ImageViewerState | null>(null)
  const openImage = useCallback((mediaIds: string[], index: number) => setViewer({ mediaIds, index }), [])

  // Ready once both the list and the photo are in; a photo that never arrives doesn't hold it.
  const leadId = card.decision.leadMediaIds[0]
  const pending = useRef({ list: true, photo: !!(leadId && mediaUri(card, leadId)), fired: false })
  const markReady = useCallback(
    (part: "list" | "photo") => {
      const state = pending.current
      state[part] = false
      if (!state.fired && !state.list && !state.photo) {
        state.fired = true
        onReady?.()
      }
    },
    [onReady],
  )
  useEffect(() => {
    const timer = setTimeout(() => markReady("photo"), REVEAL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [markReady])
  const mediaMeta = useMemo(() => mediaMetaFromStatus(card.media), [card.media])
  const content = useMemo(() => portfolioContentFromDto(card.talent), [card.talent])
  const [expanded, setExpanded] = useState(() => opensMidPortfolio(card))
  // §25 scroll budget, measured per scroll gesture (drag plus any fling) when measuring is on.
  const scrollMeter = useFrameMeter("deck.scroll")
  const [activeVideo, setActiveVideo] = useState<string | null>(null)
  const items = useMemo<Item[]>(() => {
    // The lead block is the card's hero; a portfolio hero section would repeat it.
    const sections = readVisibleSections(card.talent.sections).filter((section) => section.type !== "hero")
    if (sections.length === 0) return [{ kind: "lead", key: "lead" }, { kind: "end", key: "end" }]
    if (!expanded) return [{ kind: "lead", key: "lead" }, { kind: "depth", key: "depth" }]
    return [
      { kind: "lead", key: "lead" },
      ...sections.map((section) => ({ kind: "section" as const, key: section.id, section })),
      { kind: "end", key: "end" },
    ]
  }, [card.talent.sections, expanded])
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<Item>[] }) => {
    const reel = viewableItems.find(
      (token) => token.item.kind === "section" && token.item.section.type === "showreel",
    )
    setActiveVideo(reel ? reel.item.key : null)
  }, [])
  const sectionWidth = width - SECTION_INSET * 2

  return (
    <View
      className="overflow-hidden rounded-lg bg-surfaceMuted"
      style={{ width, height, boxShadow: shadow.card }}
    >
      <PortfolioMediaProvider components={portfolioMediaComponents} onOpenImage={openImage}>
        <ScrollGestureContext value={scrollGesture}>
          <FlashList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.key}
            getItemType={(item) => (item.kind === "section" ? item.section.type : item.kind)}
            renderScrollComponent={DeckScrollView}
            showsVerticalScrollIndicator={false}
            onLoad={() => {
              // Crew open on the lower half of the lead: caption, highlights and the work below.
              if (!openedMid.current && opensMidPortfolio(card)) {
                openedMid.current = true
                listRef.current?.scrollToOffset({
                  offset: height * 0.55,
                  animated: false,
                })
              }
              markReady("list")
            }}
            onScrollBeginDrag={() => {
              setExpanded(true)
              scrollMeter.start()
            }}
            onScrollEndDrag={(event) => {
              // Released without a fling: the scroll is over. A fling ends at momentum end.
              if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) scrollMeter.stop()
            }}
            viewabilityConfig={VIDEO_VIEWABILITY}
            onViewableItemsChanged={onViewableItemsChanged}
            extraData={activeVideo}
            onMomentumScrollBegin={() => scrollMomentum.set(true)}
            onMomentumScrollEnd={() => {
              scrollMomentum.set(false)
              scrollMeter.stop()
            }}
            renderItem={({ item }) => {
              if (item.kind === "lead") {
                return (
                  <LeadBlock
                    card={card}
                    width={width}
                    height={height}
                    interactive
                    onShare={onShare}
                    onPhotoShown={() => markReady("photo")}
                  />
                )
              }
              if (item.kind === "end") return <EndOfPortfolio onShare={onShare} />
              if (item.kind === "depth") return <DepthPlaceholder width={width} sectionWidth={sectionWidth} />
              // Sized by its content, not the renderer's height estimate: FlashList v2 measures
              // items, and a fixed estimate clips whatever it under-counts (wrapped chips,
              // long credits, large text sizes).
              return (
                <View className="items-center pt-3" style={{ width }}>
                  <View className="overflow-hidden rounded-lg bg-surface" style={{ width: sectionWidth }}>
                    <PortfolioVideoGate active={item.key === activeVideo}>
                      {renderStudioSection(item.section, mediaMeta, sectionWidth, { content })}
                    </PortfolioVideoGate>
                  </View>
                </View>
              )
            }}
          />
        </ScrollGestureContext>
      </PortfolioMediaProvider>
      <ImageViewer state={viewer} media={card.media} onClose={() => setViewer(null)} />
    </View>
  )
}
