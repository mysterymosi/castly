import { useMutation, useQuery } from "@tanstack/react-query"
import { deckPageSchema, deckSessionSchema, type DeckQueuedCard } from "@workspace/schema"
import { useCallback, useMemo, useState } from "react"

import { trpc } from "@/trpc/client"
import { trpcQuery } from "@/trpc/query-client"

/** Cards per `deck.next` page. Small pages keep each payload light (TECH_SPEC §10.2). */
export const DECK_PAGE_SIZE = 10

/** Opens a session and serves its first page. */
async function openSession() {
  const { sessionId } = deckSessionSchema.parse(await trpc.deck.start.mutate({}))
  const page = deckPageSchema.parse(await trpc.deck.next.mutate({ sessionId, limit: DECK_PAGE_SIZE }))
  return { sessionId, page }
}

/**
 * One deck session: `deck.start` and the first `deck.next` page, then further pages as the
 * booker nears the end (`loadMore`). Serving records impressions, so the opening request runs
 * once per attempt — never refetched on focus, reconnect or remount, never retried on its own —
 * and `restart` opens a fresh session by starting a new attempt.
 */
export function useDeckSession(enabled: boolean) {
  const [attempt, setAttempt] = useState(0)
  const opening = useQuery({
    queryKey: ["deck-session", attempt],
    queryFn: openSession,
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const sessionId = opening.data?.sessionId ?? null

  // Pages after the first, for the current session only.
  const [more, setMore] = useState<{ sessionId: string; cards: DeckQueuedCard[]; exhausted: boolean } | null>(
    null,
  )
  const extra = more && more.sessionId === sessionId ? more : null
  const next = useMutation(trpcQuery.deck.next.mutationOptions())

  // Stable between pages: the deck's prefetch and offsets key off this array.
  const cards = useMemo(
    () => (opening.data ? [...opening.data.page.cards, ...(extra?.cards ?? [])] : null),
    [opening.data, extra],
  )
  const exhausted = extra ? extra.exhausted : (opening.data?.page.exhausted ?? false)

  const loadMore = useCallback(() => {
    if (!sessionId || exhausted || next.isPending) return
    next.mutate(
      { sessionId, limit: DECK_PAGE_SIZE },
      {
        onSuccess: (data) => {
          const page = deckPageSchema.parse(data)
          setMore((m) => {
            const kept = m && m.sessionId === sessionId ? m.cards : []
            return { sessionId, cards: [...kept, ...page.cards], exhausted: page.exhausted }
          })
        },
      },
    )
  }, [sessionId, exhausted, next])

  const restart = useCallback(() => {
    next.reset()
    setAttempt((a) => a + 1)
  }, [next])

  return {
    sessionId,
    cards,
    exhausted,
    loadMoreError: sessionId ? (next.error as Error | null) : null,
    error: opening.error as Error | null,
    loadMore,
    restart,
  }
}
