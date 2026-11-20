import { Host, Switch } from "@expo/ui"
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import type { IncomingInterest } from "@workspace/schema"
import { useFocusEffect } from "expo-router"
import { useCallback, useState } from "react"
import { FlatList, View } from "react-native"

import { useSession } from "@/auth/session-provider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tag } from "@/components/ui/chip"
import { Icon } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Screen } from "@/components/ui/screen"
import { SegmentedControl } from "@/components/ui/segmented-control"
import {
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
} from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { Avatar } from "@/inbox/avatar"
import { listStamp, respondBy } from "@/inbox/format"
import { openChat } from "@/inbox/navigation"
import { useActiveMode, type ActiveMode } from "@/mode/active-mode"
import { errorMessage, trpc } from "@/trpc/client"
import { queryClient, trpcQuery } from "@/trpc/query-client"

const sections = [
  { value: "interests", label: "Interests" },
  { value: "matches", label: "Matches" },
  { value: "chats", label: "Chats" },
] as const
type Section = (typeof sections)[number]["value"]

export default function Inbox() {
  const mode = useActiveMode()
  const { me } = useSession()
  const canSeeInterests = mode === "talent" && !!me?.modes.includes("talent")
  const [selected, setSelected] = useState<Section>(
    mode === "talent" ? "interests" : "matches"
  )
  const [focused, setFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, [])
  )
  const section =
    !canSeeInterests && selected === "interests" ? "matches" : selected

  return (
    <Screen edges={["top"]} contentClassName="gap-4 pt-3">
      <Text variant="title" accessibilityRole="header">
        Inbox
      </Text>
      <SegmentedControl
        options={canSeeInterests ? sections : sections.slice(1)}
        value={section}
        onChange={setSelected}
      />
      {section === "interests" ? (
        <Interests focused={focused} />
      ) : (
        <MatchList mode={mode} view={section} focused={focused} />
      )}
    </Screen>
  )
}

function Interests({ focused }: { focused: boolean }) {
  const options = trpcQuery.interest.listIncoming.queryOptions()
  const incoming = useQuery({
    ...options,
    refetchInterval: focused ? 12_000 : false,
  })
  const answer = useMutation({
    mutationFn: async ({
      interestId,
      accept,
    }: {
      interestId: string
      accept: boolean
    }) => {
      if (accept) return trpc.interest.accept.mutate({ interestId })
      await trpc.interest.decline.mutate({ interestId })
      return null
    },
    onSuccess: (match, { interestId }) => {
      queryClient.setQueryData(
        options.queryKey,
        (current) =>
          current && {
            ...current,
            interests: current.interests.filter(
              (item) => item.id !== interestId
            ),
          }
      )
      if (match) {
        void queryClient.invalidateQueries(trpcQuery.match.list.pathFilter())
        openChat(match.matchId)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries(
        trpcQuery.interest.listIncoming.queryFilter()
      )
    },
  })
  const auto = useMutation(
    trpcQuery.interest.setAutoAccept.mutationOptions({
      onSuccess: ({ autoAccept }) => {
        queryClient.setQueryData(
          options.queryKey,
          (current) => current && { ...current, autoAccept }
        )
      },
    })
  )

  const pull = usePullToRefresh(incoming.refetch)
  if (!incoming.data) {
    return incoming.isError ? (
      <ErrorState
        message="Could not load your interests."
        onRetry={() => void incoming.refetch()}
      />
    ) : (
      <LoadingState label="Loading interests" />
    )
  }

  function renderInterest({ item }: { item: IncomingInterest }) {
    const from = item.booker.companyName ?? "A booker"
    return (
      <Card className="gap-4">
        <View className="flex-row items-start gap-3">
          <Avatar name={from} size={44} />
          <View className="flex-1 gap-1">
            <Text variant="body-strong">{item.headline}</Text>
            <Text variant="footnote" tone="muted">
              {from} · {listStamp(item.createdAt)}
            </Text>
          </View>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {item.role ? <Tag icon="briefcase" label={item.role.name} /> : null}
          {item.booker.verificationTier !== "phone" ? (
            <Tag
              icon="verified"
              label={item.booker.verificationTier === "professional" ? "Professionally verified" : "ID verified"}
            />
          ) : null}
          <Tag
            icon="calendar"
            label={respondBy(item.expiresAt)}
          />
        </View>
        <View className="flex-row gap-2">
          <Button
            label="Decline"
            size="md"
            variant="secondary"
            className="flex-1"
            disabled={answer.isPending}
            onPress={() => answer.mutate({ interestId: item.id, accept: false })}
          />
          <Button
            label="Accept and chat"
            size="md"
            className="flex-1"
            loading={answer.isPending && answer.variables?.interestId === item.id && answer.variables.accept}
            disabled={answer.isPending}
            onPress={() => answer.mutate({ interestId: item.id, accept: true })}
          />
        </View>
      </Card>
    )
  }

  return (
    <FlatList
      data={incoming.data.interests}
      keyExtractor={(item) => item.id}
      renderItem={renderInterest}
      {...pull}
      contentContainerClassName="gap-3 pb-6"
      ListHeaderComponent={
        <View className="gap-3">
          <Card className="gap-1 py-3">
            <Host matchContents={{ vertical: true }} style={{ minHeight: 44 }}>
              <Switch
                label="Auto-accept verified bookers"
                value={incoming.data.autoAccept}
                disabled={auto.isPending}
                onValueChange={(enabled) => auto.mutate({ enabled })}
              />
            </Host>
            <Text variant="footnote" tone="muted">
              Interest from professionally verified bookers opens a chat straight away.
            </Text>
            {auto.isError ? (
              <InlineError
                message={errorMessage(
                  auto.error,
                  "Could not save this setting."
                )}
              />
            ) : null}
          </Card>
          {answer.isError ? (
            <InlineError
              message={errorMessage(
                answer.error,
                "Could not respond to this interest."
              )}
            />
          ) : null}
          {incoming.isRefetchError ? (
            <InlineError message="Could not refresh interests." />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="mail"
          title="No pending interests"
          body="When a booker expresses interest, you can respond here."
        />
      }
    />
  )
}

const mediaLabel = {
  text: "Message",
  image: "Photo",
  video: "Video",
  audio: "Audio",
  document: "Document",
} as const

function MatchList({
  mode,
  view,
  focused,
}: {
  mode: ActiveMode
  view: Exclude<Section, "interests">
  focused: boolean
}) {
  const chats = view === "chats"
  const list = useInfiniteQuery(
    trpcQuery.match.list.infiniteQueryOptions(
      { mode, view },
      {
        getNextPageParam: (page) => page.nextCursor,
        refetchInterval: focused ? 12_000 : false,
        refetchOnMount: "always",
      }
    )
  )
  const pull = usePullToRefresh(list.refetch)
  if (!list.data) {
    return list.isError ? (
      <ErrorState
        message="Could not load your inbox."
        onRetry={() => void list.refetch()}
      />
    ) : (
      <LoadingState label={chats ? "Loading chats" : "Loading matches"} />
    )
  }
  const items = Array.from(
    new Map(
      list.data.pages
        .flatMap(({ items }) => items)
        .map((item) => [item.id, item])
    ).values()
  )
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerClassName="pb-6"
      {...pull}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetching && !list.isFetchNextPageError)
          void list.fetchNextPage()
      }}
      ListHeaderComponent={
        list.isRefetchError ? (
          <InlineError message="Could not refresh your inbox." />
        ) : null
      }
      ListFooterComponent={
        list.isFetchNextPageError ? (
          <Button
            label="Retry loading more"
            size="md"
            variant="secondary"
            onPress={() => void list.fetchNextPage()}
          />
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon={chats ? "chat" : "briefcase"}
          title={chats ? "No chats yet" : "No matches yet"}
          body="A chat opens when an interest is accepted."
        />
      }
      ItemSeparatorComponent={() => <View className="ml-16 h-px bg-border" />}
      renderItem={({ item }) => {
        const role = [item.roleName, item.projectName].filter(Boolean).join(" · ")
        const latest = item.latestMessage
        const unread = chats && item.unread
        const preview = latest
          ? latest.body || mediaLabel[latest.kind]
          : chats
            ? "Say hello"
            : "New match · say hello"
        return (
          <PressableScale
            haptic="selection"
            pressedScale={0.985}
            accessibilityRole="button"
            accessibilityLabel={[item.counterpart.name, role, unread ? "unread message" : null, preview]
              .filter(Boolean)
              .join(", ")}
            className="flex-row items-center gap-3 py-3"
            onPress={() => openChat(item.id)}
          >
            <Avatar name={item.counterpart.name} />
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-baseline gap-2">
                <Text variant="body-strong" numberOfLines={1} className="flex-1">
                  {item.counterpart.name}
                </Text>
                <Text variant="footnote" tone={unread ? "accent" : "muted"}>
                  {listStamp(chats ? (latest?.createdAt ?? item.createdAt) : item.createdAt)}
                </Text>
              </View>
              {role ? (
                <Text variant="footnote" tone="muted" numberOfLines={1}>
                  {role}
                </Text>
              ) : null}
              <View className="flex-row items-center gap-2">
                {latest && latest.kind !== "text" ? (
                  <Icon name={latest.kind === "video" ? "video" : "photo"} size={14} tone="textMuted" />
                ) : null}
                <Text
                  variant={unread ? "label" : "body-sm"}
                  tone={unread ? "default" : latest ? "muted" : "accent"}
                  numberOfLines={1}
                  className="flex-1"
                >
                  {preview}
                </Text>
                {unread ? <View className="h-2.5 w-2.5 rounded-pill bg-accent" /> : null}
              </View>
            </View>
          </PressableScale>
        )
      }}
    />
  )
}
