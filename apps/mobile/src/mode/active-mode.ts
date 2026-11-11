import type { Href } from "expo-router"
import { useSyncExternalStore } from "react"

import { useSession } from "@/auth/session-provider"
import { persistentKv } from "@/media/persistent-kv"

/**
 * Which side of Castly the app is showing: the talent studio or the booker deck. An account can
 * hold both modes; the tab bar shows one at a time (`components/app-tabs.tsx`). Persisted per
 * device, so the app reopens where the user left it.
 */
export type ActiveMode = "talent" | "booker"

const KEY = "app.activeMode"

const listeners = new Set<() => void>()
let stored: ActiveMode | null | undefined

function read(): ActiveMode | null {
  if (stored === undefined) {
    const raw = persistentKv().getString(KEY)
    stored = raw === "talent" || raw === "booker" ? raw : null
  }
  return stored
}

export function setActiveMode(mode: ActiveMode) {
  stored = mode
  persistentKv().set(KEY, mode)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Each mode's first tab: where the app opens, and where a switch lands. */
export const modeHome: Record<ActiveMode, Href> = {
  talent: "/studio",
  booker: "/discover",
}

/**
 * The mode on screen: the stored choice while the account still has it enabled, else the first
 * mode it has, else talent (whose studio offers to turn talent mode on).
 */
export function useActiveMode(): ActiveMode {
  const { me } = useSession()
  const choice = useSyncExternalStore(subscribe, read, read)
  const enabled = me?.modes ?? []
  if (choice && enabled.includes(choice)) return choice
  if (enabled.includes("talent")) return "talent"
  if (enabled.includes("booker")) return "booker"
  return "talent"
}
