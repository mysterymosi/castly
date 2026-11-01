import { useQuery } from "@tanstack/react-query"
import { bookerProfileStateSchema, type DeckCard, type DeckGoal, type DeckQueuedCard } from "@workspace/schema"
import { router, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Share, View } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"

import { errorMessage, useSession } from "@/auth/session-provider"
import { EnableBooker, FinishBookerProfile } from "@/booker/booker-gate"
import { Icon } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Screen } from "@/components/ui/screen"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { DataSaverOffer, DataSaverToggle } from "@/deck/data-saver-controls"
import { SwipeDeck, type DeckDecision, type SwipeDeckHandle } from "@/deck/swipe-deck"
import { useDeckSession } from "@/deck/use-deck-session"
import { useTokens } from "@/hooks/use-tokens"
import { haptics } from "@/lib/haptics"
import { markDeckOpened } from "@/lib/measure"
import { trpcQuery } from "@/trpc/query-client"

const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "https://castly.app").replace(/\/$/, "")

const DIRECTION = { pass: "pass", interested: "interest", save: "save" } as const

const GOAL_CHOICES = [5, 10, 20]

/**
 * The booker deck (M5): a ranked session from `deck.start`, served a page at a time by
 * `deck.next`. Opened from a role (`?roleId=&roleName=`), it casts for that role: right-swipes
 * land on the role's shortlist. Without one, they land on Saved talent.
 */
export default function DiscoverScreen() {
  const { me } = useSession()
  const { color } = useTokens()
  const params = useLocalSearchParams<{ roleId?: string; roleName?: string }>()
  const roleId = params.roleId || null
  useEffect(() => markDeckOpened(), [])
  const isBooker = !!me?.modes.includes("booker")
  const profileQuery = useQuery(
    trpcQuery.booker.getProfile.queryOptions(undefined, {
      enabled: isBooker,
      select: bookerProfileStateSchema.parse,
    }),
  )
  const hasProfile = !!profileQuery.data?.profile
  const deck = useDeckSession(isBooker && hasProfile, roleId)
  const deckRef = useRef<SwipeDeckHandle>(null)
  const [undoing, setUndoing] = useState(false)

  const { swipe } = deck
  const onDecision = useCallback(
    (decision: DeckDecision, card: DeckCard) => {
      swipe(card as DeckQueuedCard, DIRECTION[decision]).catch((error: unknown) => {
        haptics.error()
        Alert.alert("That swipe wasn't saved", errorMessage(error, "Check your connection, then undo and try again."))
      })
    },
    [swipe],
  )
  const onShare = useCallback((card: DeckCard) => {
    const { displayName, slug } = card.talent.profile
    void Share.share({ message: `${displayName} on Castly: ${SITE_URL}/${slug}` })
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
      Alert.alert("Couldn't undo", errorMessage(error, "Try again in a moment."))
    } finally {
      setUndoing(false)
    }
  }

  function chooseGoal(goal: DeckGoal) {
    const set = (count: number | null) =>
      void deck.setGoal(count).catch((error: unknown) => {
        Alert.alert("Couldn't set the goal", errorMessage(error, "Try again in a moment."))
      })
    Alert.alert("Session goal", "How many talents do you want to shortlist this session?", [
      ...GOAL_CHOICES.map((n) => ({ text: `Shortlist ${n}`, onPress: () => set(n) })),
      ...(goal.target !== null ? [{ text: "No goal", onPress: () => set(null) }] : []),
      { text: "Cancel", style: "cancel" as const },
    ])
  }

  if (!isBooker) {
    return <EnableBooker body="Discover lets you swipe through talent picked for the work you do." />
  }
  if (profileQuery.data && !hasProfile) {
    return <FinishBookerProfile body="Tell us what kind of work you do so we know who to show you first." />
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

  // Full-bleed (no Screen padding): the card's width is the screen's, less the deck's own gutter.
  // Native tabs only inset the first ScrollView on iOS; the deck doesn't scroll, so this view
  // takes the bottom inset itself — it includes the tab bar, keeping the docked actions tappable.
  return (
    // `style`, not className: NativeWind does not style this third-party view.
    <SafeAreaView edges={{ top: true, bottom: true }} style={{ flex: 1, backgroundColor: color.bg }}>
      <View className="flex-row items-center justify-between gap-2 px-5 pt-3">
        <Text variant="display-sm">Discover</Text>
        <View className="flex-row items-center gap-2">
          {deck.canUndo ? (
            <HeaderPill
              icon="undo"
              label="Undo"
              accessibilityLabel={
                deck.undosLeft === null ? "Undo last swipe" : `Undo last swipe, ${deck.undosLeft} left this session`
              }
              disabled={undoing}
              onPress={() => void undo()}
            />
          ) : null}
          <DataSaverToggle />
        </View>
      </View>
      <View className="flex-row flex-wrap items-center gap-2 px-5 pb-3 pt-2">
        {roleId ? (
          <HeaderPill
            icon="film"
            label={params.roleName ? `For ${params.roleName}` : "For a role"}
            trailingIcon="close"
            accessibilityLabel={`Casting for ${params.roleName ?? "a role"}. Clear the role`}
            onPress={() => router.setParams({ roleId: "", roleName: "" })}
          />
        ) : null}
        <HeaderPill
          icon="flag"
          label={goal.target === null ? "Set a goal" : `${goal.shortlisted} of ${goal.target} shortlisted`}
          accessibilityLabel={
            goal.target === null ? "Set a session goal" : `${goal.shortlisted} of ${goal.target} shortlisted. Change goal`
          }
          tone={goal.target !== null && goal.shortlisted >= goal.target ? "done" : "default"}
          onPress={() => chooseGoal(goal)}
        />
      </View>
      <DataSaverOffer />
      <SwipeDeck
        key={deck.sessionId}
        ref={deckRef}
        cards={deck.cards}
        exhausted={deck.exhausted}
        loadMoreError={deck.loadMoreError ? errorMessage(deck.loadMoreError, "Could not load more talent") : null}
        onNearEnd={deck.loadMore}
        onDecision={onDecision}
        onShare={onShare}
        onRestart={deck.restart}
      />
    </SafeAreaView>
  )
}

/** A compact control in the deck's header: undo, the active role, the session goal. */
function HeaderPill({
  icon,
  trailingIcon,
  label,
  accessibilityLabel,
  disabled,
  tone = "default",
  onPress,
}: {
  icon: "undo" | "film" | "flag"
  trailingIcon?: "close"
  label: string
  accessibilityLabel: string
  disabled?: boolean
  tone?: "default" | "done"
  onPress: () => void
}) {
  const done = tone === "done"
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      className={`min-h-9 flex-row items-center gap-1.5 rounded-pill border px-3 ${
        done ? "border-interested bg-interested" : "border-border bg-surface"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <Icon name={icon} size={14} tone={done ? "onInterested" : "text"} />
      <Text variant="label" tone={done ? "onInterested" : "default"} numberOfLines={1}>
        {label}
      </Text>
      {trailingIcon ? <Icon name={trailingIcon} size={12} tone="textMuted" /> : null}
    </PressableScale>
  )
}
