import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import type { Me, Session } from "@workspace/schema"

import { setAccessToken, authApi } from "./client"

const KEY = "castly.session"
const memory = new Map<string, string>()

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
  await write(KEY, JSON.stringify(session))
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
      const next = await authApi.refresh(session.refreshToken)
      await saveSession(next)
      return await authApi.me()
    } catch {
      await clearSession()
      return null
    }
  }
}
