import { persistentKv } from "./persistent-kv"
import type { UploadIntent } from "./upload-intent"

const queueKey = "castly.uploadQueue"

export function loadUploadQueue(): UploadIntent[] {
  const raw = persistentKv().getString(queueKey)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as UploadIntent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveUploadQueue(intents: UploadIntent[]) {
  persistentKv().set(queueKey, JSON.stringify(intents))
}

export function upsertIntent(intents: UploadIntent[], next: UploadIntent) {
  const index = intents.findIndex((row) => row.id === next.id)
  const copy = [...intents]
  if (index >= 0) copy[index] = next
  else copy.push(next)
  saveUploadQueue(copy)
  return copy
}

export function removeIntent(intents: UploadIntent[], id: string) {
  const copy = intents.filter((row) => row.id !== id)
  saveUploadQueue(copy)
  return copy
}
