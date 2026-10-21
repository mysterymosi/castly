import type { StudioState } from "@workspace/schema"
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { errorMessage } from "@/auth/session-provider"
import { studioApi } from "@/studio/api"

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

export function StudioProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [state, setState] = useState<StudioState | null>(null)
  const [reloading, setReloading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    studioApi
      .get()
      .then((next) => {
        if (cancelled) return
        setState(next)
        setLoadError(null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(errorMessage(caught, "Could not load studio"))
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  const reload = useCallback(async () => {
    setReloading(true)
    setLoadError(null)
    try {
      setState(await studioApi.get())
    } catch (caught) {
      setLoadError(errorMessage(caught, "Could not load studio"))
    } finally {
      setReloading(false)
    }
  }, [])

  const loading = reloading || (enabled && !state && !loadError)

  const run = useCallback(async (key: string, action: () => Promise<StudioState>, fallback: string) => {
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
  }, [])

  const clearActionError = useCallback(() => setActionError(null), [])

  const value = useMemo(
    () => ({ state, loading, loadError, actionError, pending, reload, setState, run, clearActionError }),
    [state, loading, loadError, actionError, pending, reload, run, clearActionError],
  )

  return <StudioContext value={value}>{children}</StudioContext>
}

export function useStudio() {
  const value = use(StudioContext)
  if (!value) throw new Error("useStudio must be used inside StudioProvider")
  return value
}
