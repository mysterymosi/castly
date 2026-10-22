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

import { pickVideo } from "./upload"
import type { UploadIntent } from "./upload-intent"
import { uploadQueueProcessor } from "./upload-queue-processor"

type UploadQueueValue = {
  intents: UploadIntent[]
  enqueueShowreel: (fileUri: string) => string
  pickAndEnqueueShowreel: () => Promise<string | null>
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

  const lastShowreelAttached = useRef<string | null>(null)
  useEffect(() => {
    const done = intents.find(
      (row) => row.goal === "showreel" && row.phase === "completed" && row.resultMediaId
    )
    if (!done?.resultMediaId || done.resultMediaId === lastShowreelAttached.current) return
    lastShowreelAttached.current = done.resultMediaId
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

  const dismiss = useCallback((id: string) => {
    uploadQueueProcessor.dismiss(id)
  }, [])

  const retry = useCallback((id: string) => {
    uploadQueueProcessor.retry(id)
  }, [])

  const value = useMemo(
    () => ({ intents, enqueueShowreel, pickAndEnqueueShowreel, dismiss, retry }),
    [intents, enqueueShowreel, pickAndEnqueueShowreel, dismiss, retry]
  )

  return <UploadQueueContext value={value}>{children}</UploadQueueContext>
}

export function useUploadQueue() {
  const value = use(UploadQueueContext)
  if (!value) throw new Error("useUploadQueue must be used inside UploadQueueProvider")
  return value
}
