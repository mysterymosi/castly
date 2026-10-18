import { imageSize } from "image-size"

import type { Db } from "@workspace/db"

import { applyMediaReadyEvent, consumeUploadToken, markMediaProcessing } from "./service.js"

export async function handleLocalMediaUpload(
  db: Db,
  tokenId: string,
  secret: string,
  body: Buffer,
  kindHint: "image" | "video"
) {
  const mediaId = await consumeUploadToken(db, tokenId, secret)
  await markMediaProcessing(db, mediaId)

  if (kindHint === "image") {
    const dimensions = imageSize(body)
    const providerRef = `local-${mediaId}`
    await applyMediaReadyEvent(db, {
      mediaId,
      providerRef,
      kind: "image",
      width: dimensions.width ?? 1200,
      height: dimensions.height ?? 1500,
      blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4",
    })
    return mediaId
  }

  const providerRef = `local-${mediaId}`
  await applyMediaReadyEvent(db, {
    mediaId,
    providerRef,
    kind: "video",
    width: 1280,
    height: 720,
    durationMs: 8_000,
    blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4",
  })
  return mediaId
}
