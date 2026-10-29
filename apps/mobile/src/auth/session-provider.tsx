import type { Me, Session } from "@workspace/schema"
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { authApi } from "@/auth/client"
import { clearSession, currentUser, saveSession } from "@/auth/session"
import { queryClient } from "@/trpc/query-client"

type SessionStatus = "loading" | "signedOut" | "signedIn"

/** Email captured before the code step. New accounts also include a date of birth. */
export type SignInDraft = { email: string; dateOfBirth?: string }

type SessionValue = {
  status: SessionStatus
  me: Me | null
  draft: SignInDraft
  setDraft: (draft: SignInDraft) => void
  signIn: (session: Session) => Promise<void>
  signOut: () => Promise<void>
  refreshMe: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading")
  const [me, setMe] = useState<Me | null>(null)
  const [draft, setDraft] = useState<SignInDraft>({ email: "" })

  useEffect(() => {
    let cancelled = false
    currentUser()
      .then((user) => {
        if (cancelled) return
        setMe(user)
        setStatus(user ? "signedIn" : "signedOut")
      })
      .catch(() => {
        if (!cancelled) setStatus("signedOut")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (session: Session) => {
    await saveSession(session)
    setMe(await authApi.me())
    setStatus("signedIn")
  }, [])

  const signOut = useCallback(async () => {
    await clearSession()
    // Nothing cached for this user may show up for the next one.
    queryClient.clear()
    setMe(null)
    setDraft({ email: "" })
    setStatus("signedOut")
  }, [])

  const refreshMe = useCallback(async () => {
    setMe(await authApi.me())
  }, [])

  const value = useMemo(
    () => ({ status, me, draft, setDraft, signIn, signOut, refreshMe }),
    [status, me, draft, signIn, signOut, refreshMe],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}

export function useSession() {
  const value = use(SessionContext)
  if (!value) throw new Error("useSession must be used inside SessionProvider")
  return value
}

export function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback
}
