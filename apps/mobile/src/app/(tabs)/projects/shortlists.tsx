import { useQuery } from "@tanstack/react-query"
import { shortlistListSchema, type ShortlistSummary } from "@workspace/schema"
import { router } from "expo-router"
import { View } from "react-native"

import { errorMessage } from "@/auth/session-provider"
import { PressableCard } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { trpcQuery } from "@/trpc/query-client"

const talents = (n: number) => (n === 1 ? "1 talent" : `${n} talents`)

function ShortlistRow({ shortlist }: { shortlist: ShortlistSummary }) {
  const meta = [shortlist.projectName, talents(shortlist.entryCount)].filter(Boolean).join(" · ")
  return (
    <PressableCard
      accessibilityRole="button"
      accessibilityLabel={`${shortlist.name}, ${meta}`}
      onPress={() =>
        router.push({ pathname: "/projects/shortlist/[shortlistId]", params: { shortlistId: shortlist.id } })
      }
      className="flex-row items-center gap-3"
    >
      <View className="h-11 w-11 items-center justify-center rounded-pill bg-surfaceMuted">
        <Icon name={shortlist.roleId ? "film" : "bookmark"} size={20} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {shortlist.name}
        </Text>
        <Text variant="footnote" tone="muted">
          {meta}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} tone="textMuted" />
    </PressableCard>
  )
}

/** Every shortlist the deck has built: Saved talent first, then one per role. */
export default function ShortlistsScreen() {
  const listQuery = useQuery(trpcQuery.shortlist.list.queryOptions(undefined, { select: shortlistListSchema.parse }))

  if (!listQuery.data && listQuery.error) {
    return (
      <Screen edges={["top"]} header={<ScreenHeader onBack={() => router.back()} />} contentClassName="justify-center">
        <ErrorState
          message={errorMessage(listQuery.error, "Could not load your shortlists")}
          onRetry={() => void listQuery.refetch()}
        />
      </Screen>
    )
  }
  if (!listQuery.data) return <LoadingState label="Loading shortlists" />
  const { shortlists } = listQuery.data

  return (
    <Screen scroll edges={["top"]} header={<ScreenHeader onBack={() => router.back()} />} contentClassName="gap-4 pt-2">
      <Text variant="display-sm">Shortlists</Text>
      {shortlists.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title="No shortlists yet"
          body="Swipe right in Discover to shortlist talent. Open a role first to build that role's shortlist."
          actionLabel="Go to Discover"
          onAction={() => router.navigate("/discover")}
        />
      ) : (
        <View className="gap-3">
          {shortlists.map((shortlist) => (
            <ShortlistRow key={shortlist.id} shortlist={shortlist} />
          ))}
        </View>
      )}
    </Screen>
  )
}
