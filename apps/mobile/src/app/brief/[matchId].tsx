import { useQuery } from "@tanstack/react-query"
import { matchIdInput } from "@workspace/schema"
import { router, useLocalSearchParams } from "expo-router"
import { View } from "react-native"

import { ErrorState, LoadingState } from "@/components/ui/states"
import { BriefSheet } from "@/inbox/brief-panel"
import { queryClient, trpcQuery } from "@/trpc/query-client"

function close() {
  if (router.canGoBack()) router.back()
}

/** The role brief, as a sheet over its chat. Shares the chat's cached match. */
export default function BriefRoute() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>()
  const parsed = matchIdInput.safeParse({ matchId })
  const options = trpcQuery.match.get.queryOptions({ matchId: parsed.data?.matchId ?? "" })
  const match = useQuery({ ...options, enabled: parsed.success })

  if (!parsed.success) {
    return (
      <View className="flex-1 bg-bg">
        <ErrorState message="This brief could not be found." />
      </View>
    )
  }
  if (!match.data) {
    return (
      <View className="flex-1 bg-bg">
        {match.isError ? (
          <ErrorState message="Could not load this brief." onRetry={() => void match.refetch()} />
        ) : (
          <LoadingState label="Loading brief" />
        )}
      </View>
    )
  }
  return (
    <BriefSheet
      match={match.data}
      // The chat underneath watches this and tells the talent's open thread to refresh.
      onAttached={(updated) => queryClient.setQueryData(options.queryKey, updated)}
      onClose={close}
    />
  )
}
