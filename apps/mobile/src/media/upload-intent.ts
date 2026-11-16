import type { CreateUploadUrlOutput } from "@workspace/schema"

/** What a finished upload becomes: the showreel, the card canvas, or the next free photo slot. */
export type UploadIntentGoal = "showreel" | "canvas" | "photo" | "none"

export type UploadIntentPhase =
  | "queued"
  | "uploading"
  | "processing"
  | "completed"
  | "failed"

/** Persisted upload work; survives process death. */
export type UploadIntent = {
  id: string
  kind: "image" | "video"
  fileUri: string
  /** Set for images after compression. */
  compressedUri?: string
  mimeType: string
  goal: UploadIntentGoal
  /** For a photo upload: the photo whose slot this one takes once it is ready. */
  replaceMediaId?: string
  mediaId?: string
  upload?: Pick<CreateUploadUrlOutput, "uploadUrl" | "uploadMethod" | "uploadHeaders" | "expiresAt"> & {
    /** Missing on intents persisted before single-PUT image uploads; every PUT then was Mux. */
    resumable?: boolean
  }
  phase: UploadIntentPhase
  /** 0..1 upload bytes; processing uses values >= 0.95 */
  progress: number
  error?: string
  createdAt: string
  resultMediaId?: string
}

export function uploadIntentLabel(intent: UploadIntent) {
  if (intent.goal === "showreel") return "Showreel"
  if (intent.goal === "canvas") return "Canvas"
  if (intent.goal === "photo") return "Photo"
  if (intent.kind === "video") return "Video"
  return "Photo"
}

export function isIntentActive(intent: UploadIntent) {
  return intent.phase !== "completed" && intent.phase !== "failed"
}
