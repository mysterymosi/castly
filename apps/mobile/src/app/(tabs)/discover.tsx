import { useQuery } from "@tanstack/react-query"
import {
  bookerProfileStateSchema,
  type DeckCard,
  type DeckQueuedCard,
} from "@workspace/schema"
import { router, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Share, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { SafeAreaView } from "react-native-screens/experimental"

import { errorMessage, useSession } from "@/auth/session-provider"
import { EnableBooker, FinishBookerProfile } from "@/booker/booker-gate"
import { IconButton } from "@/components/ui/icon-button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { Screen } from "@/components/ui/screen"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { DataSaverOffer } from "@/deck/data-saver-controls"
import { DeckSettingsSheet } from "@/deck/deck-settings-sheet"
import {
  SwipeDeck,
  type DeckDecision,
  type SwipeDeckHandle,
} from "@/deck/swipe-deck"
import { useDeckSession } from "@/deck/use-deck-session"
import { haptics } from "@/lib/haptics"
import { markDeckOpened } from "@/lib/measure"
import { setDataSaver, useDataSaver } from "@/media/data-saver"
import { trpcQuery } from "@/trpc/query-client"

const SITE_URL = (
  process.env.EXPO_PUBLIC_SITE_URL ?? "https://castly.app"
).replace(/\/$/, "")

/** Space around the card: from the screen edges, and above the tab bar. */
const CARD_GUTTER = 8

const DIRECTION = {
  pass: "pass",
  interested: "interest",
  save: "save",
} as const

/**
 * The booker deck (M5): a ranked session from `deck.start`, served a page at a time by
 * `deck.next`. Opened from a role (`?roleId=&roleName=`), it casts for that role: right-swipes
 * land on the role's shortlist. Without one, they land on Saved talent.
 */
export default function DiscoverScreen() {
  const { me } = useSession()
  const params = useLocalSearchParams<{ roleId?: string; roleName?: string }>()
  const roleId = params.roleId || null
  useEffect(() => markDeckOpened(), [])
  const isBooker = !!me?.modes.includes("booker")
  const profileQuery = useQuery(
    trpcQuery.booker.getProfile.queryOptions(undefined, {
      enabled: isBooker,
      select: bookerProfileStateSchema.parse,
    })
  )
  const hasProfile = !!profileQuery.data?.profile
  const deck = useDeckSession(isBooker && hasProfile, roleId)
  const deckRef = useRef<SwipeDeckHandle>(null)
  const [undoing, setUndoing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [screenHeight, setScreenHeight] = useState(0)
  // The safe frame inside the screen; its bottom gap is the tab bar and home indicator. Kept raw
  // and resolved on render: the two layouts arrive in either order.
  const [frame, setFrame] = useState<{ y: number; height: number } | null>(null)
  const safe =
    frame && screenHeight > 0
      ? { top: frame.y, bottom: screenHeight - frame.y - frame.height }
      : null
  // The measured frame's bottom includes the tab bar; its top can come back 0, so the status bar
  // height comes from the safe-area context.
  const insets = useSafeAreaInsets()
  const dataSaver = useDataSaver()

  const { swipe } = deck
  const onDecision = useCallback(
    (decision: DeckDecision, card: DeckCard) => {
      swipe(card as DeckQueuedCard, DIRECTION[decision]).catch(
        (error: unknown) => {
          haptics.error()
          Alert.alert(
            "That swipe wasn't saved",
            errorMessage(
              error,
              "Check your connection, then undo and try again."
            )
          )
        }
      )
    },
    [swipe]
  )
  const onShare = useCallback((card: DeckCard) => {
    const { displayName, slug } = card.talent.profile
    void Share.share({
      message: `${displayName} on Castly: ${SITE_URL}/${slug}`,
    })
  }, [])

  async function undo() {
    if (undoing) return
    setUndoing(true)
    try {
      const talentId = await deck.undo()
      haptics.tap()
      deckRef.current?.stepBackTo(talentId)
    } catch (error) {
      haptics.error()
      Alert.alert(
        "Couldn't undo",
        errorMessage(error, "Try again in a moment.")
      )
    } finally {
      setUndoing(false)
    }
  }

  function setGoal(count: number | null) {
    deck.setGoal(count).catch((error: unknown) => {
      Alert.alert(
        "Couldn't set the goal",
        errorMessage(error, "Try again in a moment.")
      )
    })
  }

  if (!isBooker) {
    return (
      <EnableBooker body="Discover lets you swipe through talent picked for the work you do." />
    )
  }
  if (profileQuery.data && !hasProfile) {
    return (
      <FinishBookerProfile body="Tell us what kind of work you do so we know who to show you first." />
    )
  }
  const loadError = profileQuery.error ?? deck.error
  if (!deck.cards && loadError) {
    return (
      <Screen edges={["top"]} contentClassName="justify-center">
        <ErrorState
          message={errorMessage(loadError, "Could not load talent")}
          onRetry={() => {
            void profileQuery.refetch()
            deck.restart()
          }}
        />
      </Screen>
    )
  }
  if (!deck.cards || !deck.goal) return <LoadingState label="Loading talent" />
  const goal = deck.goal

  // Header on top, the card below it as a rounded panel inset from the edges and clear of the tab
  // bar (Bumble's layout). Native tabs only inset the first ScrollView on iOS, so a SafeAreaView
  // (whose bottom edge includes the tab bar) is measured for the bottom inset instead.
  return (
    <View
      className="bg-bg flex-1"
      onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}
    >
      {/* `style`, not className: NativeWind does not style this third-party view. */}
      <SafeAreaView
        edges={{ top: true, bottom: true }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <View
          style={{ flex: 1 }}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout
            setFrame((f) =>
              f && f.y === y && f.height === height ? f : { y, height }
            )
          }}
        />
      </SafeAreaView>
      <View
        // Above the deck's cards, which carry their own zIndex, so a card swiped up passes under it.
        style={{ zIndex: 10, paddingTop: Math.max(safe?.top ?? 0, insets.top) }}
        className="bg-bg"
      >
        <View className="flex-row items-center gap-3 px-5 pt-2 pb-3">
          <View className="flex-1">
            <Text variant="display-sm" numberOfLines={1}>
              Discover
            </Text>
            {roleId ? (
              <Text variant="footnote" tone="muted" numberOfLines={1}>
                Casting for {params.roleName || "a role"}
              </Text>
            ) : null}
          </View>
          <IconButton
            icon="undo"
            shape="squircle"
            variant="raised"
            size={48}
            accessibilityLabel={
              deck.undosLeft === null
                ? "Undo last swipe"
                : `Undo last swipe, ${deck.undosLeft} left this session`
            }
            disabled={!deck.canUndo || undoing}
            onPress={() => void undo()}
          />
          {/* PRD §7.1.3: data saver is one tap from the deck, never only in settings. */}
          <IconButton
            icon="data-saver"
            shape="squircle"
            variant={dataSaver ? "accent" : "raised"}
            size={48}
            testID="deck-data-saver"
            accessibilityRole="switch"
            accessibilityState={{ checked: dataSaver }}
            accessibilityLabel="Data saver"
            accessibilityHint={
              dataSaver
                ? "Videos play only when you tap them"
                : "Stops videos loading on their own"
            }
            onPress={() => setDataSaver(!dataSaver)}
          />
          <IconButton
            icon="settings"
            shape="squircle"
            variant="raised"
            size={48}
            accessibilityLabel="Deck settings"
            onPress={() => setSettingsOpen(true)}
          />
        </View>
        {goal.target !== null ? (
          <View className="flex-row items-center gap-3 px-5 pb-3">
            <ProgressBar
              value={goal.shortlisted / goal.target}
              label={`${goal.shortlisted} of ${goal.target} shortlisted`}
              className="flex-1"
            />
            <Text
              variant="footnote"
              tone={goal.shortlisted >= goal.target ? "interested" : "muted"}
            >
              {goal.shortlisted}/{goal.target}
            </Text>
          </View>
        ) : null}
        <DataSaverOffer />
      </View>
      <View
        className="flex-1"
        style={{
          marginHorizontal: CARD_GUTTER,
          // The safe-area inset already reaches over the floating tab bar.
          marginBottom: Math.min(safe?.bottom ?? 0, insets.bottom) + CARD_GUTTER,
        }}
      >
        {safe ? (
          <SwipeDeck
            key={deck.sessionId}
            ref={deckRef}
            cards={deck.cards}
            exhausted={deck.exhausted}
            loadMoreError={
              deck.loadMoreError
                ? errorMessage(deck.loadMoreError, "Could not load more talent")
                : null
            }
            onNearEnd={deck.loadMore}
            onDecision={onDecision}
            onShare={onShare}
            onRestart={deck.restart}
            // The card sits clear of the header and the tab bar: nothing is laid over it.
            insets={{ top: 0, bottom: 0 }}
          />
        ) : null}
      </View>
      <DeckSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        goal={goal}
        onGoalChange={setGoal}
        roleName={roleId ? (params.roleName ?? "") : null}
        onClearRole={() => {
          setSettingsOpen(false)
          router.setParams({ roleId: "", roleName: "" })
        }}
      />
    </View>
  )
}
