import { useSyncExternalStore } from "react"
import { Appearance, Platform } from "react-native"

import { persistentKv } from "@/media/persistent-kv"

/**
 * Light, dark, or the phone's setting (the default). A device-wide choice, persisted. Applied
 * through `Appearance`, so everything that follows the color scheme follows it: the palette's
 * `prefers-color-scheme` variables (`tailwind.config.js`), `useColorScheme`, and native controls
 * (alerts, keyboards, menus).
 */
export type AppearancePreference = "system" | "light" | "dark"

const KEY = "appearance"
const listeners = new Set<() => void>()
let preference: AppearancePreference | null = null

function read(): AppearancePreference {
  if (preference === null) {
    const stored = persistentKv().getString(KEY)
    preference = stored === "light" || stored === "dark" ? stored : "system"
  }
  return preference
}

function apply(value: AppearancePreference) {
  // Web follows the browser's own setting.
  if (Platform.OS === "web") return
  Appearance.setColorScheme(value === "system" ? "unspecified" : value)
}

/** Call once at startup, before the first render, so a stored choice never flashes the other scheme. */
export function applyStoredAppearance() {
  apply(read())
}

export function setAppearance(value: AppearancePreference) {
  preference = value
  persistentKv().set(KEY, value)
  apply(value)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearancePreference(): AppearancePreference {
  return useSyncExternalStore(subscribe, read, read)
}
