import { fontFamily, shadow } from "@workspace/ui-tokens"
import {
  FlashList,
  type FlashListRef,
  type ViewToken,
} from "@shopify/flash-list"
import {
  mediaMetaFromStatus,
  PortfolioMediaProvider,
  PortfolioPhoto,
  PortfolioVideoGate,
  renderStudioSection,
} from "@workspace/portfolio-native"
import {
  layoutPortfolio,
  portfolioContentFromDto,
  readRenderableSections,
  withShowablePhotos,
  type DeckCard as DeckCardData,
  type DeckQueuedCard,
  type PortfolioSection,
} from "@workspace/schema"
import { useEvent } from "expo"
import { Image } from "expo-image"
import { useVideoPlayer, VideoView } from "expo-video"
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react"
import { Pressable, ScrollView, View, type ScrollViewProps } from "react-native"
import { GestureDetector, type Gesture } from "react-native-gesture-handler"
import type { SharedValue } from "react-native-reanimated"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { DecisionActions, type DeckDecision } from "@/deck/decision-actions"
import { ImageViewer, type ImageViewerState } from "@/deck/image-viewer"
import { useFrameMeter } from "@/lib/frame-meter"
import { useDataSaver } from "@/media/data-saver"
import { portfolioMediaComponents } from "@/studio/portfolio-media"
import { DarkScope } from "@/theme/dark-scope"
import { GlassPane } from "@/components/ui/glass"

type NativeGesture = ReturnType<typeof Gesture.Native>

type Item =
  | { kind: "lead"; key: string }
  | { kind: "reason"; key: string; text: string }
  | { kind: "section"; key: string; section: PortfolioSection }
  | { kind: "photo"; key: string; mediaId: string; index: number }
  | { kind: "depth"; key: string }
  | { kind: "end"; key: string }

const SECTION_INSET = 12
/** Inset of the caption from the photo's edges. */
const OVERLAY_INSET = 20
/** Longest the deck waits for a card's photo before revealing it anyway (slow network, failed load). */
const REVEAL_TIMEOUT_MS = 600
/** A showreel plays only while at least half of its section is on screen (TECH_SPEC §10.2). */
const VIDEO_VIEWABILITY = { itemVisiblePercentThreshold: 50 }

/** Dark scrim behind text laid over a photo; a CSS gradient, so no native gradient module. */
const photoScrim = {
  experimental_backgroundImage:
    "linear-gradient(to bottom, rgba(14, 15, 19, 0) 0%, rgba(14, 15, 19, 0.6) 35%, rgba(14, 15, 19, 0.96) 80%)",
} as const

/**
 * Where the screen's own controls float over the card, full bleed: the header (and status bar)
 * above, the tab bar below. Text on the card stays clear of both.
 */
export type DeckChrome = { top: number; bottom: number }

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

/**
 * Name, category, place, age range, signature credit and the highlight facts, laid over the
 * photo's lower third (in a `DarkScope`, so the text stays light) — the now-playing title block.
 * Share sits at its right, where a player puts "add". Why the card is here has its own card below
 * the photo (`ReasonCard`).
 */
function PhotoCaption({
  card,
  onShare,
  glass,
}: {
  card: DeckCardData
  onShare?: () => void
  /** Liquid Glass chips and share button; off for the cards behind the top one (GPU cost). */
  glass: boolean
}) {
  const { profile } = card.talent
  const { decision } = card
  const age = decision.ageRange
  const ageText =
    age && (age.min !== null || age.max !== null)
      ? `Plays ${[age.min, age.max].filter((n) => n !== null).join("–")}`
      : null
  const meta = [decision.categoryName, profile.cityName, ageText]
    .filter(Boolean)
    .join(" · ")
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
  const facts = profile.cardConfig.highlightFacts

  return (
    <View className="gap-3" pointerEvents="box-none">
      <View className="flex-row items-end gap-3" pointerEvents="box-none">
        <View className="flex-1 gap-1" pointerEvents="none">
          <Text
            variant="display"
           
            numberOfLines={2}
            maxFontSizeMultiplier={1.2}
          >
            {profile.displayName}
          </Text>
          {meta ? (
            <Text
              variant="body-strong"
             
              numberOfLines={1}
              style={{ opacity: 0.75 }}
            >
              {meta}
            </Text>
          ) : null}
        </View>
        {onShare ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share ${profile.displayName}'s portfolio`}
            onPress={onShare}
            hitSlop={8}
            className="mb-1 active:opacity-70"
          >
            <GlassPane
              enabled={glass}
              interactive
              style={glassButton}
              // Without glass: the outlined circle it was.
              fallbackStyle={{ borderWidth: 2, borderColor: "rgba(255, 255, 255, 0.9)" }}
            >
              <Icon name="share" size={18} color="#FFFFFF" />
            </GlassPane>
          </Pressable>
        ) : null}
      </View>
      {creditLine ? (
        <View className="gap-1.5" pointerEvents="none">
          {creditLine ? (
            <View
              className="flex-row items-center gap-2"
              style={{ opacity: 0.85 }}
            >
              <Icon name="film" size={15} color="#FFFFFF" />
              <Text
                variant="body-sm"
               
                numberOfLines={1}
                className="flex-1"
              >
                {creditLine}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {facts.length > 0 ? (
        <View
          className="flex-row flex-wrap gap-2"
          pointerEvents="none"
          accessibilityLabel={`Highlights: ${facts.join(", ")}`}
        >
          {facts.map((fact) => (
            <GlassPane key={fact} enabled={glass} style={glassChip}>
              {/* A step heavier than the footnote's medium: thin text washes out on glass. */}
              <Text
                variant="footnote"
                numberOfLines={1}
                style={{ fontFamily: fontFamily.bodyBold }}
              >
                {fact}
              </Text>
            </GlassPane>
          ))}
        </View>
      ) : null}
    </View>
  )
}

// Plain styles: GlassView is a native view NativeWind doesn't style.
const glassChip = {
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 6,
} as const
const glassButton = {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: "center",
  justifyContent: "center",
} as const

export type CardCanvas =
  | { kind: "video"; playbackUrl: string }
  | { kind: "still"; uri: string }

/**
 * The card's canvas, which the talent uploads in the studio (`canvasSpec`): a short vertical
 * loop, or a still, behind the caption. The server sends `canvasMediaId` only once it is ready and
 * in spec; without one the lead shows the photos. Never the showreel, which stays in the portfolio.
 */
export function cardCanvas(card: DeckCardData): CardCanvas | null {
  const id = card.decision.canvasMediaId
  const media = id ? card.media[id] : undefined
  if (media?.kind === "video" && media.playbackUrl)
    return { kind: "video", playbackUrl: media.playbackUrl }
  const uri = media?.kind === "image" ? media.variants?.full : null
  return uri ? { kind: "still", uri } : null
}

/**
 * The lead's moving cover: the canvas loop, muted, laid over the photo (which shows until frames
 * arrive). Mounted only while it's the deck's one live player (TECH_SPEC §10.2).
 */
function CanvasVideo({
  playbackUrl,
  width,
  height,
}: {
  playbackUrl: string
  width: number
  height: number
}) {
  const player = useVideoPlayer(
    { uri: playbackUrl, contentType: "hls" },
    (p) => {
      p.loop = true
      p.muted = true
      p.play()
    }
  )
  const { status } = useEvent(player, "statusChange", { status: player.status })
  return (
    <VideoView
      player={player}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
      // Hidden until frames arrive, so the photo shows through instead of a black frame.
      style={{
        position: "absolute",
        width,
        height,
        opacity: status === "readyToPlay" ? 1 : 0,
      }}
    />
  )
}

/**
 * The first screen of a card, a now-playing screen: the canvas (or, without one, the Main photo)
 * fills it edge to edge under the header and the tab bar (`chrome`), with the caption over a scrim
 * at its foot. The portfolio continues below, with the other photos spread between its sections.
 */
function LeadBlock({
  card,
  width,
  height,
  chrome,
  interactive,
  canvas,
  onShare,
  onPhotoShown,
}: {
  card: DeckCardData
  width: number
  height: number
  chrome: DeckChrome
  interactive: boolean
  /** The canvas over the photo, while `showing`; null shows the photos. */
  canvas?: (CardCanvas & { showing: boolean }) | null
  onShare?: () => void
  onPhotoShown?: () => void
}) {
  // Main, the talent's first photo; the rest are spread between the portfolio's sections.
  const id = card.decision.leadMediaIds[0]
  const uri = id ? mediaUri(card, id) : null
  const blurhash = id ? card.media[id]?.blurhash : null

  return (
    <View className="bg-surfaceMuted overflow-hidden" style={{ width, height }}>
      {uri ? (
        <Image
          source={{ uri }}
          placeholder={blurhash ? { blurhash } : undefined}
          recyclingKey={uri}
          contentFit="cover"
          // On the focused card the photo replaces the preview's copy already on screen; a fade
          // would flash the placeholder between them.
          transition={interactive ? 0 : 120}
          style={{ width, height }}
          onDisplay={onPhotoShown}
          onError={onPhotoShown}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          className="flex-1 items-center justify-center"
          pointerEvents="none"
        >
          <Icon name="person" size={56} tone="textMuted" />
        </View>
      )}
      {canvas?.showing && canvas.kind === "video" ? (
        <CanvasVideo
          playbackUrl={canvas.playbackUrl}
          width={width}
          height={height}
        />
      ) : null}
      {canvas?.showing && canvas.kind === "still" ? (
        <Image
          source={{ uri: canvas.uri }}
          recyclingKey={canvas.uri}
          contentFit="cover"
          transition={0}
          style={{ position: "absolute", width, height }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: height * 0.62,
          },
          photoScrim,
        ]}
      />
      {/* Over the photo's dark scrim: light text in both schemes. */}
      <DarkScope
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: OVERLAY_INSET,
          right: OVERLAY_INSET,
          bottom: chrome.bottom,
          gap: 16,
        }}
      >
        <PhotoCaption
          card={card}
          onShare={interactive ? onShare : undefined}
          glass={interactive}
        />
      </DarkScope>
    </View>
  )
}

/**
 * Why the deck served this card (`deck.next`'s `reasonText`), as the first card under the photo:
 * kept off the hero so the caption stays short. Styled like the portfolio's section cards.
 */
function ReasonCard({
  text,
  width,
  sectionWidth,
}: {
  text: string
  width: number
  sectionWidth: number
}) {
  return (
    <View className="items-center pt-4" style={{ width }}>
      <View
        className="bg-surface gap-1 rounded-lg px-4 py-3"
        style={{ width: sectionWidth, boxShadow: shadow.card }}
        accessible
        accessibilityLabel={`Why you're seeing this: ${text}`}
        testID="deck-card-reason"
      >
        {/* Matches the section cards' titles (portfolio-native `SectionTitle`). */}
        <Text className="font-heading text-body" maxFontSizeMultiplier={1.3}>
          {"Why you're seeing this"}
        </Text>
        {/* One pill per reason (the server joins them with " · ", `deckReasonText`). */}
        <View className="flex-row flex-wrap gap-2 pt-1">
          {text.split(" · ").map((reason) => (
            <View
              key={reason}
              className="bg-surfaceMuted min-h-8 justify-center rounded-pill px-3"
            >
              <Text variant="footnote" style={{ fontFamily: fontFamily.bodySemibold }}>
                {reason}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

/**
 * After the last section: decide, or share. The decision buttons are part of the card, so they
 * come with the portfolio and scroll away with it; swiping decides from anywhere.
 */
function EndOfPortfolio({
  onShare,
  onDecide,
}: {
  onShare: () => void
  onDecide: (decision: DeckDecision) => void
}) {
  return (
    <View className="items-center gap-6 px-6 pt-8 pb-8">
      <DecisionActions onDecide={onDecide} />
      <Button
        label="Share portfolio"
        variant="secondary"
        size="md"
        icon="share"
        onPress={onShare}
      />
    </View>
  )
}

/** Next card in the stack: the first screen only, no scroll list and no media players (TECH_SPEC §10.2). */
export function DeckCardPreview({
  card,
  width,
  height,
  chrome,
}: {
  card: DeckCardData
  width: number
  height: number
  chrome: DeckChrome
}) {
  // A still canvas shows behind the deck too, so it doesn't swap in when the card comes forward.
  // A loop doesn't play until then: the photo stands in for it.
  const canvas = cardCanvas(card)
  return (
    <View className="bg-surfaceMuted overflow-hidden" style={{ width, height }}>
      <LeadBlock
        card={card}
        width={width}
        height={height}
        chrome={chrome}
        interactive={false}
        canvas={canvas?.kind === "still" ? { ...canvas, showing: true } : null}
      />
    </View>
  )
}

const ScrollGestureContext = createContext<NativeGesture | null>(null)

/**
 * The card's scroll view, wrapped in the native gesture the deck's swipe coordinates with. A
 * module-level component (FlashList needs a stable `renderScrollComponent`) reading the gesture
 * from context.
 */
function DeckScrollView({
  ref,
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  const gesture = use(ScrollGestureContext)
  const scroll = <ScrollView ref={ref} {...props} />
  return gesture ? (
    <GestureDetector gesture={gesture}>{scroll}</GestureDetector>
  ) : (
    scroll
  )
}

/**
 * Stands in for the sections until the booker first scrolls: muted blocks, no media, so the list
 * has room to scroll into.
 */
function DepthPlaceholder({
  width,
  sectionWidth,
}: {
  width: number
  sectionWidth: number
}) {
  return (
    <View
      className="items-center gap-3 pt-3"
      style={{ width }}
      accessibilityElementsHidden
    >
      {[180, 140].map((h) => (
        <View
          key={h}
          className="bg-surface rounded-lg"
          style={{ width: sectionWidth, height: h, opacity: 0.6 }}
        />
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
  chrome,
  scrollGesture,
  scrollMomentum,
  onShare,
  onDecide,
  onReady,
}: {
  card: DeckCardData
  width: number
  height: number
  chrome: DeckChrome
  scrollGesture: NativeGesture
  /** Set while the list coasts after a fling; the deck ignores swipes that start then. */
  scrollMomentum: SharedValue<boolean>
  onShare: () => void
  /** The end-of-portfolio buttons; the deck exits the card as it does for a swipe. */
  onDecide: (decision: DeckDecision) => void
  /** Called once, when the list has laid out and the lead photo is on screen. */
  onReady?: () => void
}) {
  const listRef = useRef<FlashListRef<Item>>(null)
  const openedMid = useRef(false)
  const [viewer, setViewer] = useState<ImageViewerState | null>(null)
  const openImage = useCallback(
    (mediaIds: string[], index: number) => setViewer({ mediaIds, index }),
    []
  )

  // Ready once both the list and the photo are in; a photo that never arrives doesn't hold it.
  const leadId = card.decision.leadMediaIds[0]
  const pending = useRef({
    list: true,
    photo: !!(leadId && mediaUri(card, leadId)),
    fired: false,
  })
  const markReady = useCallback(
    (part: "list" | "photo") => {
      const state = pending.current
      state[part] = false
      if (!state.fired && !state.list && !state.photo) {
        state.fired = true
        onReady?.()
      }
    },
    [onReady]
  )
  useEffect(() => {
    const timer = setTimeout(() => markReady("photo"), REVEAL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [markReady])
  const mediaMeta = useMemo(() => mediaMetaFromStatus(card.media), [card.media])
  // Only photos with an image to show, as on the web page.
  const content = useMemo(
    () =>
      withShowablePhotos(portfolioContentFromDto(card.talent), (id) =>
        Boolean(mediaMeta[id]?.imageUrl)
      ),
    [card.talent, mediaMeta]
  )
  // Main is on the lead screen; the others are spread between sections. The viewer pages through
  // all of them, Main first.
  const lead = card.decision.leadMediaIds[0]
  const photos = useMemo(() => {
    const rest = (content.photoMediaIds ?? []).filter((id) => id !== lead)
    return { rest, all: lead ? [lead, ...rest] : rest, firstIndex: lead ? 1 : 0 }
  }, [content.photoMediaIds, lead])
  const [expanded, setExpanded] = useState(() => opensMidPortfolio(card))
  // §25 scroll budget, measured per scroll gesture (drag plus any fling) when measuring is on.
  const scrollMeter = useFrameMeter("deck.scroll")
  // One live player (TECH_SPEC §10.2): the first showreel section at least half on screen, else
  // the lead's canvas while the lead is. Data saver keeps the lead off a canvas loop.
  const [activeVideo, setActiveVideo] = useState<string | null>("lead")
  const dataSaver = useDataSaver()
  const canvas = useMemo(() => cardCanvas(card), [card])
  // Why the deck served this card (`deck.next`); the studio preview has none.
  const reasonText = (card as Partial<Pick<DeckQueuedCard, "reasonText">>).reasonText ?? null
  const items = useMemo<Item[]>(() => {
    const top: Item[] = [
      { kind: "lead", key: "lead" },
      ...(reasonText ? [{ kind: "reason", key: "reason", text: reasonText } as const] : []),
    ]
    // The lead block is the card's hero; a portfolio hero section would repeat it.
    // Empty list sections are left out, as on the public page.
    const sections = readRenderableSections(card.talent.sections, content, new Date()).filter(
      (section) => section.type !== "hero"
    )
    if (sections.length === 0 && photos.rest.length === 0)
      return [...top, { kind: "end", key: "end" }]
    if (!expanded)
      return [...top, { kind: "depth", key: "depth" }]
    return [
      ...top,
      ...layoutPortfolio(sections, photos.rest, photos.firstIndex).map(
        (item): Item =>
          item.kind === "section"
            ? { kind: "section", key: item.section.id, section: item.section }
            : { kind: "photo", key: `photo-${item.mediaId}`, mediaId: item.mediaId, index: item.index }
      ),
      { kind: "end", key: "end" },
    ]
  }, [card.talent.sections, content, expanded, photos, reasonText])
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<Item>[] }) => {
      const reelSection = viewableItems.find(
        (token) =>
          token.item.kind === "section" &&
          token.item.section.type === "showreel"
      )
      const lead = viewableItems.some((token) => token.item.kind === "lead")
      setActiveVideo(reelSection ? reelSection.item.key : lead ? "lead" : null)
    },
    []
  )
  const sectionWidth = width - SECTION_INSET * 2

  return (
    <View className="bg-bg overflow-hidden" style={{ width, height }}>
      <PortfolioMediaProvider
        components={portfolioMediaComponents}
        onOpenImage={openImage}
      >
        <ScrollGestureContext value={scrollGesture}>
          <FlashList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.key}
            getItemType={(item) =>
              item.kind === "section" ? item.section.type : item.kind
            }
            renderScrollComponent={DeckScrollView}
            showsVerticalScrollIndicator={false}
            // The last section clears the tab bar.
            contentContainerStyle={{ paddingBottom: chrome.bottom }}
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
              if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05)
                scrollMeter.stop()
            }}
            viewabilityConfig={VIDEO_VIEWABILITY}
            onViewableItemsChanged={onViewableItemsChanged}
            extraData={`${activeVideo}:${dataSaver}`}
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
                    chrome={chrome}
                    interactive
                    canvas={
                      canvas && !(dataSaver && canvas.kind === "video")
                        ? {
                            ...canvas,
                            showing:
                              canvas.kind === "still" || activeVideo === "lead",
                          }
                        : null
                    }
                    onShare={onShare}
                    onPhotoShown={() => markReady("photo")}
                  />
                )
              }
              if (item.kind === "end")
                return <EndOfPortfolio onShare={onShare} onDecide={onDecide} />
              if (item.kind === "reason")
                return <ReasonCard text={item.text} width={width} sectionWidth={sectionWidth} />
              if (item.kind === "photo")
                return (
                  <View className="items-center pt-3" style={{ width }}>
                    <PortfolioPhoto
                      mediaId={item.mediaId}
                      mediaMeta={mediaMeta}
                      index={item.index}
                      photoMediaIds={photos.all}
                      cardWidth={sectionWidth}
                    />
                  </View>
                )
              if (item.kind === "depth")
                return (
                  <DepthPlaceholder width={width} sectionWidth={sectionWidth} />
                )
              // Sized by its content, not the renderer's height estimate: FlashList v2 measures
              // items, and a fixed estimate clips whatever it under-counts (wrapped chips,
              // long credits, large text sizes).
              return (
                <View className="items-center pt-4" style={{ width }}>
                  {/* The shadow sits outside the clip: one view can't both clip and cast it. */}
                  <View
                    className="bg-surface rounded-lg"
                    style={{ width: sectionWidth, boxShadow: shadow.card }}
                  >
                    <View className="overflow-hidden rounded-lg">
                      <PortfolioVideoGate active={item.key === activeVideo}>
                        {renderStudioSection(
                          item.section,
                          mediaMeta,
                          sectionWidth,
                          { content }
                        )}
                      </PortfolioVideoGate>
                    </View>
                  </View>
                </View>
              )
            }}
          />
        </ScrollGestureContext>
      </PortfolioMediaProvider>
      <ImageViewer
        state={viewer}
        media={card.media}
        onClose={() => setViewer(null)}
      />
    </View>
  )
}
