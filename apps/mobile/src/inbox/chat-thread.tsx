import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import {
  CHAT_VIDEO_MAX_SECONDS,
  MESSAGE_BODY_MAX,
  type Match,
  type Message,
} from "@workspace/schema"
import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"
import { useFocusEffect } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native"

import { useSession } from "@/auth/session-provider"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { EmptyState, ErrorState, InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { Avatar } from "@/inbox/avatar"
import { clockTime, dayDivider, sameDay, shortDate } from "@/inbox/format"
import { DayDivider, MessageBubble } from "@/inbox/message-bubble"
import { openBrief, openMedia } from "@/inbox/navigation"
import { useConversationRealtime } from "@/inbox/realtime"
import { randomUUID } from "@/lib/uuid"
import { uploadImageFromUri, uploadVideoFromUri } from "@/media/upload"
import { errorMessage, trpc } from "@/trpc/client"
import { queryClient, trpcQuery } from "@/trpc/query-client"

const replies = ["Interested and available", "Interested, dates don't work", "Send more details"]
/** Messages from one sender this close together read as one run. */
const RUN_GAP_MS = 5 * 60 * 1000
type Attachment = { uri: string; kind: "image" | "video"; mediaId?: string }

export function ChatThread({ matchId, onBack }: { matchId: string; onBack: () => void }) {
  const { me } = useSession()
  const [focused, setFocused] = useState(false)
  const [body, setBody] = useState("")
  const [attachment, setAttachment] = useState<Attachment>()
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState<string>()
  const [atLatest, setAtLatest] = useState(true)
  const attempt = useRef<{ id: string; body: string; uri?: string } | null>(null)
  const marked = useRef<string | undefined>(undefined)
  // Bumped to run the mark-read effect again after a failed attempt.
  const [markRetry, setMarkRetry] = useState(0)
  const markFailures = useRef(0)
  const listRef = useRef<FlatList<Message>>(null)
  const { color } = useTokens()

  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, [])
  )

  const matchOptions = trpcQuery.match.get.queryOptions({ matchId })
  const match = useQuery({ ...matchOptions, refetchOnMount: "always" })
  const conversationId = match.data?.conversationId
  const refresh = useCallback(
    (event: "messages" | "brief") => {
      if (event === "brief") {
        void queryClient.invalidateQueries(trpcQuery.match.get.queryFilter({ matchId }))
      } else if (conversationId) {
        void queryClient.invalidateQueries(
          trpcQuery.message.list.infiniteQueryFilter({ conversationId })
        )
      }
    },
    [conversationId, matchId]
  )
  const live = useConversationRealtime(conversationId, me?.id, focused, refresh)
  const announce = useRef(live.announce)
  useEffect(() => {
    announce.current = live.announce
  }, [live.announce])

  const messagesOptions = trpcQuery.message.list.infiniteQueryOptions(
    { conversationId: conversationId ?? "" },
    {
      enabled: !!conversationId,
      getNextPageParam: (page) => page.nextCursor,
      refetchInterval: focused && !live.connected ? 8_000 : false,
      refetchOnMount: "always",
    }
  )
  const history = useInfiniteQuery(messagesOptions)
  const newest = history.data?.pages[0]?.messages[0]
  const newestId = newest && newest.senderId !== me?.id ? newest.id : undefined
  const peerReadThroughId = history.data?.pages[0]?.peerReadThroughId
  useEffect(() => {
    markFailures.current = 0
  }, [newestId, focused])
  useEffect(() => {
    if (
      !conversationId ||
      !newestId ||
      !focused ||
      !live.foreground ||
      !atLatest ||
      marked.current === newestId
    )
      return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    void trpc.message.markRead
      .mutate({ conversationId, messageId: newestId })
      .then(() => {
        if (!active) return
        marked.current = newestId
        markFailures.current = 0
        announce.current("read")
        void queryClient.invalidateQueries(trpcQuery.match.list.pathFilter())
      })
      .catch(() => {
        // A dropped request would otherwise leave the chat unread until something else changed.
        // Retry a few times with a growing delay; focusing the thread again starts afresh.
        if (!active || markFailures.current >= 4) return
        markFailures.current += 1
        timer = setTimeout(() => setMarkRetry((n) => n + 1), 2_000 * markFailures.current)
      })
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [atLatest, conversationId, focused, live.foreground, markRetry, newestId])

  // The booker shares a brief from the sheet, where this thread's channel is closed. Note the
  // change and tell the talent's open thread once the channel is back.
  const mayAttach = match.data?.counterpart.role === "talent"
  const briefStamp = match.data?.briefAttachedAt
  const seenBrief = useRef<string | null | undefined>(undefined)
  const briefToAnnounce = useRef(false)
  useEffect(() => {
    if (briefStamp === undefined) return
    if (mayAttach && seenBrief.current !== undefined && briefStamp !== seenBrief.current) {
      briefToAnnounce.current = true
    }
    seenBrief.current = briefStamp
    if (briefToAnnounce.current && live.connected) {
      announce.current("brief")
      briefToAnnounce.current = false
    }
  }, [briefStamp, live.connected, mayAttach])

  const send = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error("Open the conversation before sending.")
      const text = body.trim()
      if (attempt.current?.body !== text || attempt.current?.uri !== attachment?.uri) {
        attempt.current = { id: randomUUID(), body: text, uri: attachment?.uri }
      }
      let mediaId = attachment?.mediaId
      if (attachment && !mediaId) {
        const uploaded =
          attachment.kind === "image"
            ? await uploadImageFromUri(attachment.uri)
            : await uploadVideoFromUri(attachment.uri, "chat")
        mediaId = uploaded.id
        setAttachment({ ...attachment, mediaId })
      }
      return trpc.message.send.mutate({
        conversationId,
        clientId: attempt.current!.id,
        body: text,
        kind: attachment?.kind ?? "text",
        mediaId,
      })
    },
    onSuccess: (message) => {
      setBody("")
      setAttachment(undefined)
      attempt.current = null
      live.announce("typing", false)
      queryClient.setQueryData<typeof history.data>(messagesOptions.queryKey, (current) => {
        if (!current?.pages.length) return current
        const [first, ...older] = current.pages
        if (first!.messages.some((item) => item.id === message.id)) return current
        return {
          ...current,
          pages: [{ ...first!, messages: [message, ...first!.messages] }, ...older],
        }
      })
      refresh("messages")
      void queryClient.invalidateQueries(trpcQuery.match.list.pathFilter())
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    },
  })

  async function pickAttachment() {
    setPicking(true)
    setPickError(undefined)
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 1,
      })
      const asset = result.canceled ? undefined : result.assets[0]
      if (!asset) return
      const video = asset.type === "video"
      // Refused before uploading: the original is what the sender pays for in data and time.
      if (video && asset.duration && asset.duration > CHAT_VIDEO_MAX_SECONDS * 1000) {
        setPickError(
          `Videos can be up to ${CHAT_VIDEO_MAX_SECONDS / 60} minutes. Trim it in your gallery, then attach it again.`
        )
        return
      }
      send.reset()
      setAttachment({ uri: asset.uri, kind: video ? "video" : "image" })
    } catch {
      setPickError("Could not open your media library.")
    } finally {
      setPicking(false)
    }
  }

  if (!match.data) {
    return (
      <Screen header={<ScreenHeader title="Chat" onBack={onBack} />}>
        {match.isError ? (
          <ErrorState
            message="Could not open this conversation."
            onRetry={() => void match.refetch()}
          />
        ) : (
          <LoadingState label="Opening chat" />
        )}
      </Screen>
    )
  }

  const counterpart = match.data.counterpart
  const context = [match.data.projectName, match.data.roleName].filter(Boolean).join(" · ")
  const status = live.typing ? "Typing…" : live.peerPresent ? "In this chat" : context
  const header = (
    <View className="border-b border-border pb-2">
      <View className="min-h-14 flex-row items-center gap-2 pl-2 pr-4">
        <IconButton icon="chevron-left" variant="ghost" accessibilityLabel="Back" onPress={onBack} />
        <Avatar name={counterpart.name} size={40} present={live.peerPresent} />
        <View className="flex-1">
          <Text variant="body-strong" numberOfLines={1} accessibilityRole="header">
            {counterpart.name}
          </Text>
          {status ? (
            <Text
              variant="footnote"
              tone={live.typing || live.peerPresent ? "interested" : "muted"}
              numberOfLines={1}
              accessibilityLiveRegion="polite"
            >
              {status}
            </Text>
          ) : null}
        </View>
      </View>
      {match.data.brief || mayAttach ? <BriefStrip match={match.data} /> : null}
    </View>
  )

  const items = Array.from(
    new Map(
      history.data?.pages.flatMap((page) => page.messages).map((item) => [item.id, item])
    ).values()
  )
  const quickReplies = counterpart.role === "booker" && !body && !attachment
  const footer = history.data ? (
    <View className="gap-2">
      {quickReplies ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-2"
        >
          {replies.map((reply) => (
            <PressableScale
              key={reply}
              haptic="selection"
              accessibilityRole="button"
              accessibilityHint="Puts this reply in the message box"
              disabled={send.isPending}
              className="min-h-10 justify-center rounded-pill border border-border bg-surface px-3"
              onPress={() => {
                setBody(reply)
                send.reset()
              }}
            >
              <Text variant="label">{reply}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      ) : null}
      {attachment ? (
        <AttachmentPreview
          attachment={attachment}
          disabled={send.isPending}
          onRemove={() => {
            setAttachment(undefined)
            send.reset()
          }}
        />
      ) : null}
      {send.isError || pickError ? (
        <InlineError
          message={pickError ?? errorMessage(send.error, "Could not send your message.")}
        />
      ) : null}
      {send.isPending ? (
        <Text variant="footnote" tone="muted" accessibilityLiveRegion="polite">
          {attachment && !attachment.mediaId ? "Uploading attachment…" : "Sending…"}
        </Text>
      ) : null}
      <View className="flex-row items-end gap-2">
        <View
          className="min-h-11 flex-1 flex-row items-end rounded-xl border border-border bg-surfaceMuted"
          style={{ borderCurve: "continuous" }}
        >
          <IconButton
            icon="plus"
            variant="ghost"
            size={40}
            accessibilityLabel="Attach photo or video"
            disabled={picking || send.isPending || !!attachment}
            onPress={() => void pickAttachment()}
            className="mb-0.5 ml-0.5"
          />
          <TextInput
            accessibilityLabel="Message"
            placeholder={attachment ? "Add a caption" : "Message"}
            placeholderTextColor={color.textMuted}
            selectionColor={color.focus}
            multiline
            value={body}
            maxLength={MESSAGE_BODY_MAX}
            editable={!send.isPending}
            className="max-h-32 min-h-11 flex-1 py-2.5 pr-3 font-bodyMedium text-body text-text"
            onChangeText={(text) => {
              setBody(text)
              live.announce("typing", !!text.trim())
              send.reset()
            }}
            onBlur={() => live.announce("typing", false)}
          />
        </View>
        <IconButton
          icon="send"
          variant="accent"
          accessibilityLabel="Send message"
          disabled={picking || send.isPending || (!body.trim() && !attachment)}
          onPress={() => send.mutate()}
        />
      </View>
    </View>
  ) : undefined

  const openMessageMedia = (item: Message, params: Parameters<typeof openMedia>[0]) =>
    openMedia({
      ...params,
      title: item.senderId === me?.id ? "You" : counterpart.name,
      subtitle: `${dayDivider(item.createdAt)} at ${clockTime(item.createdAt)}`,
    })

  return (
    <Screen header={header} footer={footer}>
      {!history.data ? (
        history.isError ? (
          <ErrorState message="Could not load messages." onRetry={() => void history.refetch()} />
        ) : (
          <LoadingState label="Loading messages" />
        )
      ) : (
        <>
          {history.isRefetchError && !history.isFetchNextPageError ? (
            <View className="pt-2">
              <InlineError message="Messages could not refresh." />
            </View>
          ) : null}
          {items.length === 0 ? (
            <View className="flex-1 justify-center">
              <EmptyState
                icon="chat"
                title={`Say hello to ${counterpart.name}`}
                body={`You matched on ${shortDate(match.data.createdAt)}.${
                  counterpart.role === "booker" ? " A quick reply below gets things going." : ""
                }`}
              />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              inverted
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerClassName="pb-3 pt-2"
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 60 }}
              scrollEventThrottle={100}
              onScroll={({ nativeEvent }) => setAtLatest(nativeEvent.contentOffset.y < 64)}
              onEndReached={() => {
                if (history.hasNextPage && !history.isFetching && !history.isFetchNextPageError)
                  void history.fetchNextPage()
              }}
              ListFooterComponent={
                history.isFetchNextPageError ? (
                  <Button
                    label="Retry loading older messages"
                    size="md"
                    variant="secondary"
                    onPress={() => void history.fetchNextPage()}
                  />
                ) : null
              }
              renderItem={({ item, index }) => {
                // Newest first: the older neighbour is the next item, the newer one the previous.
                const older = items[index + 1]
                const newer = items[index - 1]
                const firstOfDay = !older || !sameDay(older.createdAt, item.createdAt)
                const run = (a?: Message, b?: Message) =>
                  !!a &&
                  !!b &&
                  a.senderId === b.senderId &&
                  sameDay(a.createdAt, b.createdAt) &&
                  Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) < RUN_GAP_MS
                const mine = item.senderId === me?.id
                return (
                  <View style={{ paddingTop: firstOfDay ? 8 : run(older, item) ? 2 : 10 }}>
                    {firstOfDay ? <DayDivider label={dayDivider(item.createdAt)} /> : null}
                    <MessageBubble
                      item={item}
                      mine={mine}
                      seen={
                        mine &&
                        item.id === newest?.id &&
                        !!peerReadThroughId &&
                        peerReadThroughId >= item.id
                      }
                      continuesNewer={run(item, newer)}
                      onOpenMedia={(params) => openMessageMedia(item, params)}
                    />
                  </View>
                )
              }}
            />
          )}
        </>
      )}
    </Screen>
  )
}

/**
 * The brief, pinned under the chat header. Names the role when one is shared; otherwise it asks
 * the booker to share one. Opens the brief sheet.
 */
function BriefStrip({ match }: { match: Match }) {
  const brief = match.brief
  const title = brief ? brief.roleName : "Share a role brief"
  const subtitle = brief
    ? brief.projectName
    : "Show the role, dates and rate"
  return (
    <PressableScale
      haptic="selection"
      pressedScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={brief ? `Role brief: ${brief.roleName}, ${brief.projectName}` : title}
      accessibilityHint="Opens the role brief"
      onPress={() => openBrief(match.id)}
      className="mx-4 mt-1 min-h-14 flex-row items-center gap-3 rounded-lg bg-surfaceMuted px-3 py-2"
      style={{ borderCurve: "continuous" }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-md bg-accent/20"
        style={{ borderCurve: "continuous" }}
      >
        <Icon name={brief ? "brief" : "plus"} size={17} tone="accentText" />
      </View>
      <View className="flex-1">
        <Text variant="caption" tone="muted">
          {brief ? "Role brief" : "No brief yet"}
        </Text>
        <Text variant="label" numberOfLines={1}>
          {brief ? `${title} · ${subtitle}` : subtitle}
        </Text>
      </View>
      <Text variant="label" tone="accent">
        {brief ? "View" : "Share"}
      </Text>
    </PressableScale>
  )
}

function AttachmentPreview({
  attachment,
  disabled,
  onRemove,
}: {
  attachment: Attachment
  disabled: boolean
  onRemove: () => void
}) {
  return (
    <View
      className="flex-row items-center gap-3 rounded-lg bg-surfaceMuted p-2"
      style={{ borderCurve: "continuous" }}
    >
      {attachment.kind === "image" ? (
        <Image
          source={attachment.uri}
          contentFit="cover"
          style={{ width: 48, height: 48, borderRadius: 8 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-sm bg-inverse">
          <Icon name="play" size={18} tone="onInverse" />
        </View>
      )}
      <View className="flex-1">
        <Text variant="label">{attachment.kind === "image" ? "Photo" : "Video"}</Text>
        <Text variant="footnote" tone="muted">
          {attachment.mediaId ? "Uploaded" : "Sends with your message"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove attachment"
        disabled={disabled}
        hitSlop={8}
        onPress={onRemove}
        className="h-11 w-11 items-center justify-center"
        style={{ opacity: disabled ? 0.4 : 1 }}
      >
        <Icon name="close" size={18} tone="textMuted" />
      </Pressable>
    </View>
  )
}
