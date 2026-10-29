import { ImageManipulator, SaveFormat } from "expo-image-manipulator"
import * as ImagePicker from "expo-image-picker"
import { fetch as expoFetch } from "expo/fetch"
import { File } from "expo-file-system"
import type { CreateUploadUrlOutput, MediaStatusOutput } from "@workspace/schema"

import { invoke, trpc } from "@/trpc/client"

const readyPollMs = 800
const readyTimeoutMs = 120_000

/** Resumable PUT chunks must be a multiple of 256 KiB (except the last). */
const chunkBytes = 4 * 256 * 1024
const retryDelaysMs = [0, 2000, 5000, 10_000]

export async function pickImages(max = 3) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: max > 1,
    selectionLimit: max,
    quality: 1,
  })
  if (result.canceled) return []
  return result.assets.map((asset) => asset.uri)
}

export async function pickVideo() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsMultipleSelection: false,
    quality: 1,
  })
  if (result.canceled) return null
  return result.assets[0]?.uri ?? null
}

export async function compressImage(uri: string) {
  const rendered = await ImageManipulator.manipulate(uri)
    .resize({ width: 2048 })
    .renderAsync()
  const manipulated = await rendered.saveAsync({
    compress: 0.82,
    format: SaveFormat.JPEG,
  })
  return manipulated.uri
}

export async function createUpload(kind: "image" | "video", contentType: string, byteSize?: number) {
  return invoke(() =>
    trpc.media.createUploadUrl.mutate({ kind, contentType, byteSize })
  )
}

export async function waitForReady(mediaId: string) {
  const started = Date.now()
  while (Date.now() - started < readyTimeoutMs) {
    const status = await invoke(() => trpc.media.status.query({ mediaId }))
    if (status.status === "ready") return status
    if (status.status === "failed" || status.status === "quarantined") {
      throw new Error(`Upload failed (${status.status})`)
    }
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), readyPollMs)
    })
  }
  throw new Error("Upload timed out waiting for processing")
}

/** The provider no longer holds this upload session (timed out, cancelled, or unknown). */
export class UploadSessionGoneError extends Error {}

/**
 * Reads a resumable-upload response: 200/201 means the provider has the whole file,
 * 308 means it has `bytes=0-N` so far. Anything else either means the session is gone
 * or is a transient failure worth retrying.
 */
function receivedBytes(response: {
  status: number
  headers: { get(name: string): string | null }
}): number | "complete" {
  if (response.status === 200 || response.status === 201) return "complete"
  if (response.status === 308) {
    const match = response.headers.get("range")?.match(/^bytes=0-(\d+)$/)
    return match ? Number(match[1]) + 1 : 0
  }
  if (response.status >= 500 || response.status === 408 || response.status === 429) {
    throw new Error(`Upload failed (${response.status})`)
  }
  throw new UploadSessionGoneError(`Upload session rejected (${response.status})`)
}

/** Asks the provider how many bytes of this session it already has. */
async function queryReceivedBytes(uploadUrl: string, total: number) {
  const response = await expoFetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${total}` },
    redirect: "manual",
  })
  return receivedBytes(response)
}

/**
 * Chunked PUT against a resumable upload URL (Mux direct uploads). The provider is the
 * source of truth for progress, so after an app kill or network drop we ask it where to
 * continue instead of re-sending from byte 0. Reads one chunk at a time from disk, so a
 * large showreel never sits in memory.
 */
async function resumablePut(
  upload: CreateUploadUrlOutput,
  fileUri: string,
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void
) {
  const file = new File(fileUri)
  const total = file.size
  if (!total) throw new Error("Upload file is missing or empty")

  const handle = file.open()
  try {
    // null = unknown, ask the provider before sending anything.
    let received: number | "complete" | null = null
    let failures = 0
    while (received !== "complete") {
      try {
        if (received === null) received = await queryReceivedBytes(upload.uploadUrl, total)
        if (received === "complete") break
        onProgress?.(received, total)

        const end = Math.min(received + chunkBytes, total)
        handle.offset = received
        const response = await expoFetch(upload.uploadUrl, {
          method: "PUT",
          headers: {
            ...upload.uploadHeaders,
            "Content-Range": `bytes ${received}-${end - 1}/${total}`,
          },
          body: handle.readBytes(end - received),
          redirect: "manual",
        })
        received = receivedBytes(response)
        failures = 0
      } catch (error) {
        if (error instanceof UploadSessionGoneError || failures >= retryDelaysMs.length) {
          throw error
        }
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), retryDelaysMs[failures])
        })
        failures += 1
        received = null
      }
    }
    onProgress?.(total, total)
  } finally {
    handle.close()
  }
}

/**
 * Whole file in one request (Cloudflare Images POST, Supabase Storage signed PUT). Sends raw
 * bytes through expo/fetch: React Native's fetch swaps our Content-Type for a file Blob's
 * (empty) type, which Storage rejects as 415.
 */
async function singleRequestUpload(
  upload: CreateUploadUrlOutput,
  fileUri: string,
  contentType: string
) {
  const response = await expoFetch(upload.uploadUrl, {
    method: upload.uploadMethod,
    headers: { ...upload.uploadHeaders, "Content-Type": contentType },
    body: await new File(fileUri).bytes(),
  })
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`)
  }
}

type TransferOptions = {
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void
}

export async function transferUpload(
  upload: CreateUploadUrlOutput,
  fileUri: string,
  mimeType: string,
  options: TransferOptions = {}
) {
  if (upload.resumable) {
    await resumablePut(upload, fileUri, options.onProgress)
    return
  }
  await singleRequestUpload(upload, fileUri, mimeType)
}

export function fileByteSize(fileUri: string) {
  return new File(fileUri).size
}

export async function uploadImageFromUri(uri: string): Promise<MediaStatusOutput> {
  const compressedUri = await compressImage(uri)
  const upload = await createUpload("image", "image/jpeg", fileByteSize(compressedUri))
  await transferUpload(upload, compressedUri, "image/jpeg")
  return waitForReady(upload.mediaId)
}

export async function uploadVideoFromUri(uri: string): Promise<MediaStatusOutput> {
  const file = new File(uri)
  const mimeType = file.type || "video/mp4"
  const upload = await createUpload("video", mimeType, file.size)
  await transferUpload(upload, uri, mimeType)
  return waitForReady(upload.mediaId)
}

export async function uploadQuickStartPhotos(count = 3) {
  const uris = await pickImages(count)
  if (uris.length < count) {
    throw new Error(`Select at least ${count} photos`)
  }
  const statuses: MediaStatusOutput[] = []
  for (const uri of uris.slice(0, count)) {
    statuses.push(await uploadImageFromUri(uri))
  }
  return statuses.map((row) => row.id)
}
