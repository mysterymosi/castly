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
import { useDataSaver } from "@/media/data-saver"
import { trpcQuery } from "@/trpc/query-client"

const SITE_URL = (
  process.env.EXPO_PUBLIC_SITE_URL ?? "https://castly.app"
).replace(/\/$/, "")

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
  const [headerHeight, setHeaderHeight] = useState(0)
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

  // The deck runs full bleed, under the status bar and the tab bar, like a now-playing screen; the
  // header floats over it. Native tabs only inset the first ScrollView on iOS, so a SafeAreaView
  // (whose bottom edge includes the tab bar) is measured for the insets instead.
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
          insets={{ top: headerHeight, bottom: safe.bottom }}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            // Above the deck's cards, which carry their own zIndex.
            zIndex: 10,
            paddingTop: Math.max(safe?.top ?? 0, insets.top),
          },
          topScrim,
        ]}
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
            variant="glass"
            size={48}
            accessibilityLabel={
              deck.undosLeft === null
                ? "Undo last swipe"
                : `Undo last swipe, ${deck.undosLeft} left this session`
            }
            disabled={!deck.canUndo || undoing}
            onPress={() => void undo()}
          />
          <View>
            <IconButton
              icon="settings"
              shape="squircle"
              variant="glass"
              size={48}
              accessibilityLabel={
                dataSaver ? "Deck settings. Data saver is on" : "Deck settings"
              }
              onPress={() => setSettingsOpen(true)}
            />
            {dataSaver ? (
              <View
                pointerEvents="none"
                className="rounded-pill border-bg bg-interested absolute top-2 right-2 h-2.5 w-2.5 border-2"
              />
            ) : null}
          </View>
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

/** Keeps the header legible over a pale photo. */
const topScrim = {
  experimental_backgroundImage:
    "linear-gradient(to bottom, rgba(14, 15, 19, 0.75) 0%, rgba(14, 15, 19, 0.35) 70%, rgba(14, 15, 19, 0) 100%)",
} as const
