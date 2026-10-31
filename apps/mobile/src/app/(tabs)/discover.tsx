import { useQuery } from "@tanstack/react-query"
import { bookerProfileStateSchema, type DeckCard } from "@workspace/schema"
import { useCallback, useEffect } from "react"
import { Share, View } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"

import { errorMessage, useSession } from "@/auth/session-provider"
import { EnableBooker, FinishBookerProfile } from "@/booker/booker-gate"
import { Screen } from "@/components/ui/screen"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { DataSaverOffer, DataSaverToggle } from "@/deck/data-saver-controls"
import { SwipeDeck } from "@/deck/swipe-deck"
import { useDeckSession } from "@/deck/use-deck-session"
import { useTokens } from "@/hooks/use-tokens"
import { markDeckOpened } from "@/lib/measure"
import { trpcQuery } from "@/trpc/query-client"

const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "https://castly.app").replace(/\/$/, "")

/**
 * The booker deck (M5): a ranked session from `deck.start`, served a page at a time by
 * `deck.next` as the booker swipes.
 */
export default function DiscoverScreen() {
  const { me } = useSession()
  const { color } = useTokens()
  useEffect(() => markDeckOpened(), [])
  const isBooker = !!me?.modes.includes("booker")
  const profileQuery = useQuery(
    trpcQuery.booker.getProfile.queryOptions(undefined, {
      enabled: isBooker,
      select: bookerProfileStateSchema.parse,
    }),
  )
  const hasProfile = !!profileQuery.data?.profile
  const deck = useDeckSession(isBooker && hasProfile)

  // M5 5.9 records passes, interests and saves; for now a decision only advances the deck.
  const onDecision = useCallback(() => {}, [])
  const onShare = useCallback((card: DeckCard) => {
    const { displayName, slug } = card.talent.profile
    void Share.share({ message: `${displayName} on Castly: ${SITE_URL}/${slug}` })
  }, [])

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
  if (!deck.cards) return <LoadingState label="Loading talent" />

  // Full-bleed (no Screen padding): the card's width is the screen's, less the deck's own gutter.
  // Native tabs only inset the first ScrollView on iOS; the deck doesn't scroll, so this view
  // takes the bottom inset itself — it includes the tab bar, keeping the docked actions tappable.
  return (
    // `style`, not className: NativeWind does not style this third-party view.
    <SafeAreaView edges={{ top: true, bottom: true }} style={{ flex: 1, backgroundColor: color.bg }}>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-3">
        <Text variant="display-sm">Discover</Text>
        <DataSaverToggle />
      </View>
      <DataSaverOffer />
      <SwipeDeck
        key={deck.sessionId}
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
