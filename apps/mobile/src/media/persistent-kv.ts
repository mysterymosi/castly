import { Platform } from "react-native"
import { createMMKV, type MMKV } from "react-native-mmkv"

const memory = new Map<string, string>()

function webStorage(): Pick<MMKV, "getString" | "set" | "remove"> {
  return {
    getString(key: string) {
      return memory.has(key) ? memory.get(key) : undefined
    },
    set(key: string, value: string) {
      memory.set(key, value)
    },
    remove(key: string) {
      memory.delete(key)
      return true
    },
  }
}

let native: MMKV | null = null

/** MMKV on native; in-memory on web (Expo web dev). */
export function persistentKv() {
  if (Platform.OS === "web") return webStorage()
  if (!native) native = createMMKV({ id: "castly-media" })
  return native
}
