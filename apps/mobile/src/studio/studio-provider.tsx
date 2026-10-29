import { useQuery } from "@tanstack/react-query"
import type { StudioState } from "@workspace/schema"
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react"

import { errorMessage } from "@/auth/session-provider"
import { asStudioState, fetchStudioState } from "@/studio/api"
import { queryClient, trpcQuery } from "@/trpc/query-client"

type StudioValue = {
  state: StudioState | null
  loading: boolean
  /** Failure loading the studio at all. */
  loadError: string | null
  /** Failure of the most recent mutation; cleared on the next one. */
  actionError: string | null
  /** Key of the mutation currently in flight, for per-control spinners. */
  pending: string | null
  reload: () => Promise<void>
  setState: (next: StudioState) => void
  /** Runs a studio mutation, applies the returned state and records any error. */
  run: (key: string, action: () => Promise<StudioState>, fallback: string) => Promise<boolean>
  clearActionError: () => void
}

const StudioContext = createContext<StudioValue | null>(null)

const studioKey = () => trpcQuery.talent.studio.get.queryKey()

/**
 * The studio's server state lives in the query cache (`talent.studio.get`); this provider keeps the
 * shape the studio screens already use. Mutations stay imperative through `run`, which writes each
 * returned StudioState straight into the cache.
 */
export function StudioProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const query = useQuery({
    ...trpcQuery.talent.studio.get.queryOptions(undefined, { enabled, select: asStudioState }),
    // Same key and data as the plain query, but timed for the M2.10 measurement log.
    queryFn: fetchStudioState,
  })
  const [reloading, setReloading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const state = query.data ?? null
  // Only a studio that never loaded is a load error; a failed background refresh keeps the cache.
  const loadError = !state && query.error ? errorMessage(query.error, "Could not load studio") : null
  // First load or an explicit reload — never a quiet background refetch.
  const loading = reloading || (enabled && query.isPending && !query.error)

  const { refetch } = query
  const reload = useCallback(async () => {
    setReloading(true)
    try {
      await refetch()
    } finally {
      setReloading(false)
    }
  }, [refetch])

  const setState = useCallback((next: StudioState) => {
    queryClient.setQueryData(studioKey(), next)
  }, [])

  const run = useCallback(
    async (key: string, action: () => Promise<StudioState>, fallback: string) => {
      setPending(key)
      setActionError(null)
      try {
        setState(await action())
        return true
      } catch (caught) {
        setActionError(errorMessage(caught, fallback))
        return false
      } finally {
        setPending(null)
      }
    },
    [setState],
  )

  const clearActionError = useCallback(() => setActionError(null), [])

  const value = useMemo(
    () => ({ state, loading, loadError, actionError, pending, reload, setState, run, clearActionError }),
    [state, loading, loadError, actionError, pending, reload, setState, run, clearActionError],
  )

  return <StudioContext value={value}>{children}</StudioContext>
}

export function useStudio() {
  const value = use(StudioContext)
  if (!value) throw new Error("useStudio must be used inside StudioProvider")
  return value
}
