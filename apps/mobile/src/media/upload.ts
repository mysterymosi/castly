import { ImageManipulator, SaveFormat } from "expo-image-manipulator"
import * as ImagePicker from "expo-image-picker"
import type { CreateUploadUrlOutput, MediaStatusOutput } from "@workspace/schema"
import { Upload } from "tus-js-client"

import { invoke, trpc } from "@/trpc/client"

const readyPollMs = 800
const readyTimeoutMs = 120_000

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

async function compressImage(uri: string) {
  const rendered = await ImageManipulator.manipulate(uri)
    .resize({ width: 2048 })
    .renderAsync()
  const manipulated = await rendered.saveAsync({
    compress: 0.82,
    format: SaveFormat.JPEG,
  })
  return manipulated.uri
}

async function createUpload(kind: "image" | "video", contentType: string, byteSize?: number) {
  return invoke(() =>
    trpc.media.createUploadUrl.mutate({ kind, contentType, byteSize })
  )
}

async function waitForReady(mediaId: string) {
  const started = Date.now()
  while (Date.now() - started < readyTimeoutMs) {
    const status = await invoke(() => trpc.media.status.query({ mediaId }))
    if (status.status === "ready") return status
    if (status.status === "failed" || status.status === "quarantined") {
      console.error("Media status:", status)
      throw new Error(`Upload failed (${status.status})`)
    }
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), readyPollMs)
    })
  }
  throw new Error("Upload timed out waiting for processing")
}

async function putUpload(upload: CreateUploadUrlOutput, body: Blob) {
  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.uploadHeaders,
    body,
  })
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`)
  }
}

async function postUpload(
  upload: CreateUploadUrlOutput,
  body: Blob,
  contentType: string
) {
  const response = await fetch(upload.uploadUrl, {
    method: "POST",
    headers: { ...upload.uploadHeaders, "Content-Type": contentType },
    body,
  })
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`)
  }
}

function tusUpload(upload: CreateUploadUrlOutput, fileUri: string, mimeType: string) {
  return new Promise<void>((resolve, reject) => {
    const file = {
      uri: fileUri,
      name: fileUri.split("/").pop() ?? "upload.bin",
      type: mimeType,
    } as unknown as File
    const uploadClient = new Upload(file, {
      uploadUrl: upload.uploadMethod === "TUS" ? upload.uploadUrl : undefined,
      endpoint: upload.uploadMethod === "TUS" ? undefined : upload.uploadUrl,
      headers: upload.uploadHeaders,
      metadata: {},
      onError: (error) => reject(error),
      onSuccess: () => resolve(),
    })
    uploadClient.start()
  })
}

export async function uploadImageFromUri(uri: string): Promise<MediaStatusOutput> {
  const compressedUri = await compressImage(uri)
  const response = await fetch(compressedUri)
  const blob = await response.blob()
  const upload = await createUpload("image", "image/jpeg", blob.size)
  if (upload.uploadMethod === "TUS") {
    await tusUpload(upload, compressedUri, "image/jpeg")
  } else {
    await postUpload(upload, blob, "image/jpeg")
  }
  return waitForReady(upload.mediaId)
}

export async function uploadVideoFromUri(uri: string): Promise<MediaStatusOutput> {
  const response = await fetch(uri)
  const blob = await response.blob()
  const upload = await createUpload("video", blob.type || "video/mp4", blob.size)
  if (upload.uploadMethod === "TUS") {
    await tusUpload(upload, uri, blob.type || "video/mp4")
  } else if (upload.uploadMethod === "PUT") {
    await putUpload(upload, blob)
  } else {
    await postUpload(upload, blob, blob.type || "video/mp4")
  }
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
