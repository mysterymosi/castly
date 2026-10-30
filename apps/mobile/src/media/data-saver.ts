import { useNetInfo, type NetInfoState } from "@react-native-community/netinfo"
import { useSyncExternalStore } from "react"

import { persistentKv } from "@/media/persistent-kv"

/**
 * Data-saver (TECH_SPEC §10.3): showreels stream at the lowest rendition and load only on tap,
 * and the deck stops prefetching the next card's portfolio. A device-wide setting, persisted.
 */
const KEY = "dataSaver.enabled"

const listeners = new Set<() => void>()
let enabled: boolean | null = null

function read(): boolean {
  if (enabled === null) enabled = persistentKv().getString(KEY) === "1"
  return enabled
}

export function setDataSaver(on: boolean) {
  enabled = on
  persistentKv().set(KEY, on ? "1" : "0")
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDataSaver(): boolean {
  return useSyncExternalStore(subscribe, read, read)
}

/**
 * A metered or slow connection: any connection the OS marks expensive (all cellular on iOS), or
 * 2G/3G cellular. NetInfo, not expo-network: expo-network reports only the connection type.
 */
export function isMeteredOrSlow(state: NetInfoState): boolean {
  if (!state.details) return false
  if (state.type === "cellular") {
    const generation = state.details.cellularGeneration
    return state.details.isConnectionExpensive || generation === "2g" || generation === "3g"
  }
  return state.details.isConnectionExpensive
}

/** Whether the deck should offer data-saver now: metered or slow, and not already on. */
export function useOfferDataSaver(): boolean {
  const network = useNetInfo()
  const on = useDataSaver()
  return !on && isMeteredOrSlow(network)
}

/** The stream capped at its lowest rendition. Mux takes `max_resolution`; other hosts are unchanged. */
export function lowestRendition(playbackUrl: string): string {
  try {
    const url = new URL(playbackUrl)
    if (url.hostname !== "stream.mux.com") return playbackUrl
    url.searchParams.set("max_resolution", "270p")
    return url.toString()
  } catch {
    return playbackUrl
  }
}
