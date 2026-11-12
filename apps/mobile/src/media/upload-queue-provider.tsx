import NetInfo from "@react-native-community/netinfo"
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { pickCanvas, pickVideo } from "./upload"
import { isIntentActive, type UploadIntent } from "./upload-intent"
import { uploadQueueProcessor } from "./upload-queue-processor"
import { loadUploadQueue } from "./upload-queue-store"

type UploadQueueValue = {
  intents: UploadIntent[]
  enqueueShowreel: (fileUri: string) => string
  pickAndEnqueueShowreel: () => Promise<string | null>
  /** The intent id, or why the pick can't be a canvas; null when cancelled. */
  pickAndEnqueueCanvas: () => Promise<{ id: string } | { problem: string } | null>
  /** Queues already-picked (cropped) photos: new slots, or `replaceMediaId`'s slot for one. */
  enqueuePhotos: (uris: string[], replaceMediaId?: string) => void
  dismiss: (id: string) => void
  retry: (id: string) => void
}

const UploadQueueContext = createContext<UploadQueueValue | null>(null)

function randomId() {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export function UploadQueueProvider({
  children,
  onStudioChanged,
}: {
  children: ReactNode
  onStudioChanged?: () => void | Promise<void>
}) {
  const [intents, setIntents] = useState<UploadIntent[]>([])

  useEffect(() => {
    return uploadQueueProcessor.subscribe(setIntents)
  }, [])

  useEffect(() => {
    void uploadQueueProcessor.drain()
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) void uploadQueueProcessor.drain()
    })
    return unsubscribe
  }, [])

  // Showreel, canvas and photo uploads change the studio when they finish; refetch once per upload.
  const lastAttached = useRef(new Set<string>())
  useEffect(() => {
    const done = intents.filter(
      (row) =>
        (row.goal === "showreel" || row.goal === "canvas" || row.goal === "photo") &&
        row.phase === "completed" &&
        row.resultMediaId &&
        !lastAttached.current.has(row.resultMediaId)
    )
    if (done.length === 0) return
    for (const row of done) lastAttached.current.add(row.resultMediaId!)
    void onStudioChanged?.()
  }, [intents, onStudioChanged])

  const enqueueShowreel = useCallback((fileUri: string) => {
    return uploadQueueProcessor.enqueue({
      id: randomId(),
      kind: "video",
      fileUri,
      mimeType: "video/mp4",
      goal: "showreel",
    })
  }, [])

  const pickAndEnqueueShowreel = useCallback(async () => {
    const uri = await pickVideo()
    if (!uri) return null
    return enqueueShowreel(uri)
  }, [enqueueShowreel])

  const pickAndEnqueueCanvas = useCallback(async () => {
    const picked = await pickCanvas()
    if (!picked || "problem" in picked) return picked
    // The studio blocks a pick while a canvas uploads; clear the finished or failed ones.
    for (const row of loadUploadQueue()) {
      if (row.goal === "canvas" && !isIntentActive(row)) uploadQueueProcessor.dismiss(row.id)
    }
    const id = uploadQueueProcessor.enqueue({
      id: randomId(),
      kind: picked.kind,
      fileUri: picked.uri,
      mimeType: picked.mimeType,
      goal: "canvas",
    })
    return { id }
  }, [])

  const enqueuePhotos = useCallback((uris: string[], replaceMediaId?: string) => {
    for (const uri of uris) {
      uploadQueueProcessor.enqueue({
        id: randomId(),
        kind: "image",
        fileUri: uri,
        mimeType: "image/jpeg",
        goal: "photo",
        ...(replaceMediaId ? { replaceMediaId } : {}),
      })
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    uploadQueueProcessor.dismiss(id)
  }, [])

  const retry = useCallback((id: string) => {
    uploadQueueProcessor.retry(id)
  }, [])

  const value = useMemo(
    () => ({
      intents,
      enqueueShowreel,
      pickAndEnqueueShowreel,
      pickAndEnqueueCanvas,
      enqueuePhotos,
      dismiss,
      retry,
    }),
    [
      enqueuePhotos,
      intents,
      enqueueShowreel,
      pickAndEnqueueShowreel,
      pickAndEnqueueCanvas,
      dismiss,
      retry,
    ]
  )

  return <UploadQueueContext value={value}>{children}</UploadQueueContext>
}

export function useUploadQueue() {
  const value = use(UploadQueueContext)
  if (!value) throw new Error("useUploadQueue must be used inside UploadQueueProvider")
  return value
}
