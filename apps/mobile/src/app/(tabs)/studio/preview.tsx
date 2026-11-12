import { useQuery } from "@tanstack/react-query"
import { deckCardSchema } from "@workspace/schema"
import { router } from "expo-router"
import { useMemo, useState } from "react"
import { Alert, Linking, Platform, Pressable, Share, View, type LayoutChangeEvent } from "react-native"
import { Gesture } from "react-native-gesture-handler"
import { useSharedValue } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ScreenHeader } from "@/components/ui/screen-header"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { errorMessage } from "@/auth/session-provider"
import { DeckCard } from "@/deck/deck-card"
import { useStudio } from "@/studio/studio-provider"
import { trpcQuery } from "@/trpc/query-client"

const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "https://castly.app").replace(/\/$/, "")

/**
 * The talent's own card exactly as a booker sees it (`talent.studio.previewCard`, serialized for
 * an unverified booker): the same component the deck renders, so hidden sections, empty sections,
 * rate visibility, the canvas and the photo layout all match. It doesn't swipe, and the decision
 * buttons only explain themselves.
 */
export default function PreviewScreen() {
  const { state } = useStudio()
  const insets = useSafeAreaInsets()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  // Fetched fresh on every open, so it reflects the edits just made.
  // Parsed as the deck parses its pages, which applies the schema defaults the card relies on.
  const card = useQuery({
    ...trpcQuery.talent.studio.previewCard.queryOptions(undefined, {
      select: (data) => deckCardSchema.parse(data),
    }),
    staleTime: 0,
  })
  const scrollGesture = useMemo(() => Gesture.Native(), [])
  const scrollMomentum = useSharedValue(false)
  const chrome = useMemo(() => ({ top: 8, bottom: insets.bottom + 16 }), [insets.bottom])

  const profile = state?.talent.profile
  const live = profile?.status === "live"

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout
    setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }))
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Platform.OS === "ios" ? 8 : insets.top }}>
      <ScreenHeader
        title="Preview"
        backIcon="close"
        onBack={() => router.back()}
        right={
          live && profile ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open your public page"
              onPress={() => void Linking.openURL(`${SITE_URL}/${profile.slug}`)}
              hitSlop={8}
              className="active:opacity-70"
            >
              <Text variant="label">Public page</Text>
            </Pressable>
          ) : null
        }
      />
      <View className="flex-1" onLayout={onLayout} accessibilityLabel="Your card as bookers see it">
        {card.data && size ? (
          <DeckCard
            card={card.data}
            width={size.width}
            height={size.height}
            chrome={chrome}
            scrollGesture={scrollGesture}
            scrollMomentum={scrollMomentum}
            onShare={() =>
              void Share.share({
                message: `${card.data.talent.profile.displayName} on Castly: ${SITE_URL}/${card.data.talent.profile.slug}`,
              })
            }
            onDecide={() =>
              Alert.alert("This is a preview", "Bookers pass, show interest or save you here.")
            }
          />
        ) : card.error ? (
          <ErrorState message={errorMessage(card.error, "Could not load the preview")} onRetry={() => void card.refetch()} />
        ) : (
          <LoadingState />
        )}
      </View>
    </View>
  )
}
