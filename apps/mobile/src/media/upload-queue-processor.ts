import type { CreateUploadUrlOutput } from "@workspace/schema"

import { studioApi } from "@/studio/api"

import { mediaApi } from "./api"
import {
  UploadSessionGoneError,
  compressImage,
  createUpload,
  fileByteSize,
  transferUpload,
  waitForReady,
} from "./upload"
import type { UploadIntent } from "./upload-intent"
import { loadUploadQueue, saveUploadQueue } from "./upload-queue-store"

export type UploadQueueListener = (intents: UploadIntent[]) => void

function uploadExpired(intent: UploadIntent) {
  if (!intent.upload?.expiresAt) return false
  return Date.parse(intent.upload.expiresAt) <= Date.now()
}

function sessionFromIntent(intent: UploadIntent): CreateUploadUrlOutput | null {
  if (!intent.mediaId || !intent.upload) return null
  return {
    mediaId: intent.mediaId,
    uploadUrl: intent.upload.uploadUrl,
    uploadMethod: intent.upload.uploadMethod,
    uploadHeaders: intent.upload.uploadHeaders,
    expiresAt: intent.upload.expiresAt,
  }
}

async function attachShowreel(mediaId: string) {
  let state = await studioApi.get()
  let section = state.talent.sections.find((s) => s.type === "showreel")
  if (!section) {
    state = await studioApi.createSection("showreel")
    section = state.talent.sections.find((s) => s.type === "showreel")
  }
  if (!section) throw new Error("Could not create showreel section")
  await studioApi.updateSection({
    sectionId: section.id,
    schemaVersion: section.schemaVersion,
    config: { mediaId },
  })
}

export class UploadQueueProcessor {
  private running = false
  private listeners = new Set<UploadQueueListener>()

  subscribe(listener: UploadQueueListener) {
    this.listeners.add(listener)
    listener(loadUploadQueue())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(intents: UploadIntent[]) {
    for (const listener of this.listeners) listener(intents)
  }

  private patch(id: string, update: Partial<UploadIntent>) {
    const intents = loadUploadQueue()
    const index = intents.findIndex((row) => row.id === id)
    if (index < 0) return intents
    const next = { ...intents[index]!, ...update }
    intents[index] = next
    saveUploadQueue(intents)
    this.emit(intents)
    return intents
  }

  enqueue(partial: Omit<UploadIntent, "phase" | "progress" | "createdAt">) {
    const intents = loadUploadQueue()
    const intent: UploadIntent = {
      ...partial,
      phase: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
    }
    intents.push(intent)
    saveUploadQueue(intents)
    this.emit(intents)
    void this.drain()
    return intent.id
  }

  dismiss(id: string) {
    const intents = loadUploadQueue().filter((row) => row.id !== id)
    saveUploadQueue(intents)
    this.emit(intents)
  }

  retry(id: string) {
    const intents = loadUploadQueue()
    const index = intents.findIndex((row) => row.id === id)
    if (index < 0) return
    intents[index] = {
      ...intents[index]!,
      phase: "queued",
      progress: 0,
      error: undefined,
    }
    saveUploadQueue(intents)
    this.emit(intents)
    void this.drain()
  }

  async drain() {
    if (this.running) return
    this.running = true
    try {
      while (true) {
        const intents = loadUploadQueue()
        const next = intents.find(
          (row) => row.phase === "queued" || row.phase === "uploading" || row.phase === "processing"
        )
        if (!next) break
        await this.runIntent(next)
      }
    } finally {
      this.running = false
    }
  }

  private async runIntent(intent: UploadIntent) {
    try {
      let working = { ...intent }
      if (working.kind === "image" && !working.compressedUri) {
        working.compressedUri = await compressImage(working.fileUri)
        this.patch(working.id, { compressedUri: working.compressedUri })
      }

      const fileUri =
        working.kind === "image" ? (working.compressedUri ?? working.fileUri) : working.fileUri

      // "processing" is only persisted after the provider has every byte. Re-sending
      // would waste the user's data (or fail outright on single-use upload URLs).
      if (working.phase !== "processing") {
        working = await this.sendBytes(working, fileUri)
        this.patch(working.id, { phase: "processing", progress: 0.94 })
      }

      if (!working.mediaId) throw new Error("Upload session missing")
      const ready = await waitForReady(working.mediaId)

      if (working.goal === "showreel") {
        await attachShowreel(ready.id)
      }

      this.patch(working.id, {
        phase: "completed",
        progress: 1,
        resultMediaId: ready.id,
        error: undefined,
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Upload failed"
      this.patch(intent.id, { phase: "failed", error: message })
    }
  }

  /** Creates a provider upload session and persists it on the intent. */
  private async startSession(working: UploadIntent, fileUri: string) {
    const created = await createUpload(
      working.kind,
      working.mimeType || (working.kind === "image" ? "image/jpeg" : "video/mp4"),
      fileByteSize(fileUri)
    )
    const next: UploadIntent = {
      ...working,
      mediaId: created.mediaId,
      upload: {
        uploadUrl: created.uploadUrl,
        uploadMethod: created.uploadMethod,
        uploadHeaders: created.uploadHeaders,
        expiresAt: created.expiresAt,
      },
      phase: "uploading",
      progress: 0,
      error: undefined,
    }
    this.patch(next.id, next)
    return next
  }

  /**
   * Gets the file's bytes to the provider, continuing an existing session when there is
   * one. Returns the intent as persisted (it may carry a new session).
   */
  private async sendBytes(intent: UploadIntent, fileUri: string) {
    const resuming = Boolean(intent.mediaId && intent.upload) && !uploadExpired(intent)
    let working = intent
    if (resuming) {
      this.patch(working.id, { phase: "uploading", error: undefined })
    } else {
      working = await this.startSession(working, fileUri)
    }

    try {
      await this.transfer(working, fileUri, resuming)
    } catch (caught) {
      if (!(resuming && caught instanceof UploadSessionGoneError)) throw caught
      // The provider dropped the old session (timed out or cancelled). Start over once.
      working = await this.startSession(working, fileUri)
      await this.transfer(working, fileUri, false)
    }
    return working
  }

  private async transfer(working: UploadIntent, fileUri: string, resuming: boolean) {
    const session = sessionFromIntent(working)
    if (!session) throw new Error("Upload session missing")

    // A POST can't be resumed and its URL is single-use. If the previous run's POST
    // landed before the app died, the server has already moved past `pending`.
    if (resuming && session.uploadMethod === "POST") {
      const status = await mediaApi.status(session.mediaId)
      if (status.status !== "pending") return
    }

    await transferUpload(session, fileUri, working.mimeType, {
      onProgress: (sent, total) => {
        const progress = total > 0 ? Math.min(0.92, sent / total) : 0
        this.patch(working.id, { progress, phase: "uploading" })
      },
    })
  }
}

export const uploadQueueProcessor = new UploadQueueProcessor()
