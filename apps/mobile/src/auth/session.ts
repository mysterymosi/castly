import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import type { Me, Session } from "@workspace/schema"

import { getAccessToken, setAccessToken, authApi } from "./client"

const KEY = "castly.session"
const memory = new Map<string, string>()
type StoredSession = Session & { expiresAt?: number }
let refreshInFlight: Promise<Session | null> | undefined

async function read(key: string) {
  if (Platform.OS === "web") return memory.get(key) ?? null
  return SecureStore.getItemAsync(key)
}

async function write(key: string, value: string) {
  if (Platform.OS === "web") {
    memory.set(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

async function remove(key: string) {
  if (Platform.OS === "web") {
    memory.delete(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}

export async function saveSession(session: Session) {
  setAccessToken(session.accessToken)
  await write(KEY, JSON.stringify({ ...session, expiresAt: Date.now() + session.expiresIn * 1000 }))
}

/**
 * Spends the stored refresh token once. Supabase rotates refresh tokens and treats a second use as
 * theft, so the startup path and Realtime's token callback must share one call, not make two.
 * Resolves null, saving nothing, when the user signed out or changed while it ran.
 */
function refreshSession(session: Session) {
  refreshInFlight ??= authApi.refresh(session.refreshToken).then(async (next) => {
    if (getAccessToken() !== session.accessToken) return null
    await saveSession(next)
    return next
  }).finally(() => { refreshInFlight = undefined })
  return refreshInFlight
}

/** Shares the app session with Realtime and renews it before the socket's JWT expires. */
export async function getRealtimeAccessToken() {
  const token = getAccessToken()
  const raw = token && await read(KEY)
  if (!raw || token !== getAccessToken()) return null
  const session = JSON.parse(raw) as StoredSession
  if (session.accessToken !== token) return getAccessToken()
  if (session.expiresAt && session.expiresAt > Date.now() + 90_000) return token

  const next = await refreshSession(session)
  return next?.accessToken ?? getAccessToken()
}

export async function clearSession() {
  setAccessToken(null)
  await remove(KEY)
}

export async function currentUser(): Promise<Me | null> {
  const raw = await read(KEY)
  if (!raw) return null
  const session = JSON.parse(raw) as Session
  setAccessToken(session.accessToken)
  try {
    return await authApi.me()
  } catch {
    try {
      if (!(await refreshSession(session))) return null
      return await authApi.me()
    } catch {
      await clearSession()
      return null
    }
  }
}
