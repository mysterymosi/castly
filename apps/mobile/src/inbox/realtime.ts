import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js"
import { focusManager } from "@tanstack/react-query"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { getRealtimeAccessToken } from "@/auth/session"

const origin = process.env.EXPO_PUBLIC_SUPABASE_URL
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const subscribeFocus = (notify: () => void) => focusManager.subscribe(notify)
const getFocus = () => focusManager.isFocused()
const typingTtl = 4000

type Signal = "typing" | "read" | "brief"

/**
 * One socket for every open thread, so moving between chats or apps adds and removes channels
 * instead of reconnecting. It closes `idleMs` after the last thread lets go, which also ends it
 * after sign-out or when the app has been in the background for a while.
 */
const idleMs = 15_000
let shared: RealtimeClient | undefined
let holders = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined

function acquireClient(url: string, key: string) {
  clearTimeout(idleTimer)
  holders += 1
  shared ??= new RealtimeClient(url, {
    params: { apikey: key },
    accessToken: getRealtimeAccessToken,
  })
  return shared
}

function releaseClient() {
  holders -= 1
  if (holders > 0) return
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (holders > 0 || !shared) return
    const idle = shared
    shared = undefined
    void idle.disconnect().catch(() => {})
  }, idleMs)
}

export function useConversationRealtime(
  conversationId: string | undefined,
  userId: string | undefined,
  focused: boolean,
  onRefresh: (event: "messages" | "brief") => void
) {
  const [connected, setConnected] = useState(false)
  const [typing, setTyping] = useState(false)
  const [peerPresent, setPeerPresent] = useState(false)
  const foreground = useSyncExternalStore(subscribeFocus, getFocus, () => false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastTyping = useRef(0)

  useEffect(() => {
    if (
      !origin ||
      !publishableKey ||
      !conversationId ||
      !userId ||
      !focused ||
      !foreground
    )
      return
    let active = true
    let typingTimer: ReturnType<typeof setTimeout> | undefined
    const client = acquireClient(
      origin.replace(/\/$/, "").replace(/^http/, "ws") + "/realtime/v1",
      publishableKey
    )
    const channel = client.channel(`conversation:${conversationId}`, {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: userId, enabled: true },
      },
    })
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => onRefresh("messages")
      )
      .on("broadcast", { event: "read" }, () => onRefresh("messages"))
      .on("broadcast", { event: "brief" }, () => onRefresh("brief"))
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.userId === userId) return
        clearTimeout(typingTimer)
        setTyping(payload?.typing === true)
        if (payload?.typing === true)
          typingTimer = setTimeout(() => setTyping(false), typingTtl)
      })
      .on("presence", { event: "sync" }, () => {
        setPeerPresent(
          Object.keys(channel.presenceState()).some((key) => key !== userId)
        )
      })
    void client
      .setAuth()
      .then(() => {
        if (!active || !client.accessTokenValue) return
        channel.subscribe((status) => {
          if (!active) return
          const subscribed = status === "SUBSCRIBED"
          setConnected(subscribed)
          channelRef.current = subscribed ? channel : null
          if (subscribed) {
            onRefresh("messages")
            onRefresh("brief")
            void channel.track({ active: true }).catch(() => {})
          } else {
            setPeerPresent(false)
            setTyping(false)
          }
        })
      })
      .catch(() => {
        // Keep the message history on its polling fallback if session renewal fails.
      })

    return () => {
      active = false
      channelRef.current = null
      lastTyping.current = 0
      clearTimeout(typingTimer)
      setConnected(false)
      setTyping(false)
      setPeerPresent(false)
      void client
        .removeChannel(channel)
        .catch(() => {})
        .finally(releaseClient)
    }
  }, [conversationId, userId, focused, foreground, onRefresh])

  function announce(event: Signal, isTyping?: boolean) {
    const channel = channelRef.current
    if (!channel) return
    if (event === "typing") {
      const now = Date.now()
      if (isTyping && now - lastTyping.current < 2000) return
      lastTyping.current = isTyping ? now : 0
    }
    void channel
      .send({ type: "broadcast", event, payload: { userId, typing: isTyping } })
      .catch(() => {})
  }

  return { connected, typing, peerPresent, foreground, announce }
}
