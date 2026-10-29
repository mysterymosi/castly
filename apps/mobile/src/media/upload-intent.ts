import type { CreateUploadUrlOutput } from "@workspace/schema"

export type UploadIntentGoal = "showreel" | "none"

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
  if (intent.kind === "video") return "Video"
  return "Photo"
}

export function isIntentActive(intent: UploadIntent) {
  return intent.phase !== "completed" && intent.phase !== "failed"
}
