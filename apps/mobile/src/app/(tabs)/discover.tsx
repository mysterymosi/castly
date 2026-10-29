import { useQuery } from "@tanstack/react-query"
import { bookerProfileStateSchema, deckPreviewSchema, type DeckCard } from "@workspace/schema"
import { useCallback } from "react"
import { Share, View } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"

import { errorMessage, useSession } from "@/auth/session-provider"
import { EnableBooker, FinishBookerProfile } from "@/booker/booker-gate"
import { Screen } from "@/components/ui/screen"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { SwipeDeck } from "@/deck/swipe-deck"
import { useTokens } from "@/hooks/use-tokens"
import { trpcQuery } from "@/trpc/query-client"

const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "https://castly.app").replace(/\/$/, "")

/**
 * The booker deck (M5). Cards come from the interim `deck.preview` until the ranked
 * `deck.start` / `deck.next` replace it; the card shape is the same.
 */
export default function DiscoverScreen() {
  const { me } = useSession()
  const { color } = useTokens()
  const isBooker = !!me?.modes.includes("booker")
  const profileQuery = useQuery(
    trpcQuery.booker.getProfile.queryOptions(undefined, {
      enabled: isBooker,
      select: bookerProfileStateSchema.parse,
    }),
  )
  const hasProfile = !!profileQuery.data?.profile
  const deckQuery = useQuery(
    trpcQuery.deck.preview.queryOptions(
      { limit: 20 },
      {
        enabled: isBooker && hasProfile,
        select: deckPreviewSchema.parse,
        // A session's cards must not reshuffle under the booker when the app regains focus.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
    ),
  )

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
  const loadError = profileQuery.error ?? deckQuery.error
  if (!deckQuery.data && loadError) {
    return (
      <Screen edges={["top"]} contentClassName="justify-center">
        <ErrorState
          message={errorMessage(loadError, "Could not load talent")}
          onRetry={() => {
            void profileQuery.refetch()
            void deckQuery.refetch()
          }}
        />
      </Screen>
    )
  }
  if (!deckQuery.data) return <LoadingState label="Loading talent" />

  // Full-bleed (no Screen padding): the card's width is the screen's, less the deck's own gutter.
  // Native tabs only inset the first ScrollView on iOS; the deck doesn't scroll, so this view
  // takes the bottom inset itself — it includes the tab bar, keeping the docked actions tappable.
  return (
    // `style`, not className: NativeWind does not style this third-party view.
    <SafeAreaView edges={{ top: true, bottom: true }} style={{ flex: 1, backgroundColor: color.bg }}>
      <View className="px-5 pb-3 pt-3">
        <Text variant="display-sm">Discover</Text>
      </View>
      <SwipeDeck
        cards={deckQuery.data.cards}
        onDecision={onDecision}
        onShare={onShare}
        onRestart={() => void deckQuery.refetch()}
      />
    </SafeAreaView>
  )
}
