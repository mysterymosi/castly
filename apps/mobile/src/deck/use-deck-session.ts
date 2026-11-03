import { useMutation, useQuery } from "@tanstack/react-query"
import {
  deckGoalSchema,
  deckPageSchema,
  deckSessionSchema,
  deckSwipeResultSchema,
  deckUndoResultSchema,
  type DeckGoal,
  type DeckQueuedCard,
  type DeckSwipeDirection,
} from "@workspace/schema"
import { useCallback, useMemo, useRef, useState } from "react"

import { trpc } from "@/trpc/client"
import { queryClient, trpcQuery } from "@/trpc/query-client"

/** Cards per `deck.next` page. Small pages keep each payload light (TECH_SPEC §10.2). */
export const DECK_PAGE_SIZE = 10

/** Opens a session (for a role, when given) and serves its first page. */
async function openSession(roleId: string | null) {
  const session = deckSessionSchema.parse(await trpc.deck.start.mutate({ roleId }))
  const page = deckPageSchema.parse(
    await trpc.deck.next.mutate({ sessionId: session.sessionId, limit: DECK_PAGE_SIZE }),
  )
  return { session, page }
}

/** What the server last said about the session's goal and undos. */
type Progress = { sessionId: string; goal: DeckGoal; undosLeft: number | null }

/**
 * One deck session: `deck.start` and the first `deck.next` page, then further pages as the
 * booker nears the end (`loadMore`). Serving records impressions, so the opening request runs
 * once per attempt — never refetched on focus, reconnect or remount, never retried on its own —
 * and `restart` opens a fresh session by starting a new attempt.
 *
 * Decisions (`swipe`, `undo`, `setGoal`) run one at a time, in order: an undo pressed while a
 * swipe is still in flight must take back that swipe, not the one before it.
 */
export function useDeckSession(enabled: boolean, roleId: string | null) {
  const [attempt, setAttempt] = useState(0)
  const opening = useQuery({
    queryKey: ["deck-session", roleId, attempt],
    queryFn: () => openSession(roleId),
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const sessionId = opening.data?.session.sessionId ?? null

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

  const [progress, setProgress] = useState<Progress | null>(null)
  const latest = progress && progress.sessionId === sessionId ? progress : null
  const goal: DeckGoal | null = opening.data
    ? (latest?.goal ?? { target: opening.data.session.goalCount, shortlisted: 0 })
    : null
  const undosLeft = latest ? latest.undosLeft : (opening.data?.session.undosLeft ?? null)
  const [swipes, setSwipes] = useState<{ sessionId: string; count: number } | null>(null)
  const liveSwipes = swipes && swipes.sessionId === sessionId ? swipes.count : 0

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

  // One decision at a time, in the order the booker made them.
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const inOrder = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const run = chain.current.then(work, work)
    chain.current = run.catch(() => undefined)
    return run
  }, [])

  const shortlistsChanged = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: trpcQuery.shortlist.pathKey() })
  }, [])

  /** Records a decision on a served card. Resolves once the server has it; rejects on failure. */
  const swipe = useCallback(
    (card: DeckQueuedCard, direction: DeckSwipeDirection) => {
      if (!sessionId) return Promise.resolve()
      setSwipes((s) => ({ sessionId, count: (s && s.sessionId === sessionId ? s.count : 0) + 1 }))
      return inOrder(async () => {
        const result = deckSwipeResultSchema.parse(
          await trpc.deck.swipe.mutate({ sessionId, position: card.position, direction }),
        )
        setProgress({ sessionId, goal: result.goal, undosLeft: result.undosLeft })
        if (direction !== "pass") shortlistsChanged()
      })
    },
    [sessionId, inOrder, shortlistsChanged],
  )

  /** Takes back the last swipe; resolves with the talent to step back to. */
  const undo = useCallback(() => {
    if (!sessionId) return Promise.reject(new Error("No deck session"))
    return inOrder(async () => {
      const result = deckUndoResultSchema.parse(await trpc.deck.undo.mutate({ sessionId }))
      setProgress({ sessionId, goal: result.goal, undosLeft: result.undosLeft })
      setSwipes((s) => (s && s.sessionId === sessionId ? { sessionId, count: Math.max(0, s.count - 1) } : s))
      shortlistsChanged()
      return result.talentId
    })
  }, [sessionId, inOrder, shortlistsChanged])

  const setGoal = useCallback(
    (goalCount: number | null) => {
      if (!sessionId) return Promise.resolve()
      return inOrder(async () => {
        const next = deckGoalSchema.parse(await trpc.deck.setGoal.mutate({ sessionId, goalCount }))
        setProgress((p) => ({
          sessionId,
          goal: next,
          undosLeft: p && p.sessionId === sessionId ? p.undosLeft : (opening.data?.session.undosLeft ?? null),
        }))
      })
    },
    [sessionId, inOrder, opening.data],
  )

  const restart = useCallback(() => {
    next.reset()
    setAttempt((a) => a + 1)
  }, [next])

  return {
    sessionId,
    cards,
    exhausted,
    goal,
    /** Whether there's a swipe this session to take back, within the undo limit. */
    canUndo: liveSwipes > 0 && undosLeft !== 0,
    undosLeft,
    loadMoreError: sessionId ? (next.error as Error | null) : null,
    error: opening.error as Error | null,
    loadMore,
    swipe,
    undo,
    setGoal,
    restart,
  }
}
