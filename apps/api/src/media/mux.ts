import { MediaError } from "./errors.js"
import { muxClient, muxCorsOrigin } from "./mux-client.js"

type MuxUploadResult = {
  uploadUrl: string
  uploadMethod: "PUT"
  uploadHeaders: Record<string, string>
  providerRef: string
}

/** The MP4 a chat video gets: small enough to keep on a phone, sharp enough to judge a take. */
export const CHAT_MP4_RESOLUTION = "720p"

export async function createMuxVideoUpload(
  mediaId: string,
  options: { mp4: boolean } = { mp4: false },
): Promise<MuxUploadResult> {
  const mux = muxClient()
  const upload = await mux.video.uploads.create({
    cors_origin: muxCorsOrigin(),
    timeout: 3600,
    new_asset_settings: {
      passthrough: mediaId,
      playback_policies: ["public"],
      // The rendition carries the media id too, so its own webhooks find the row.
      ...(options.mp4
        ? { static_renditions: [{ resolution: CHAT_MP4_RESOLUTION, passthrough: mediaId }] }
        : {}),
    },
  })
  if (!upload.url || !upload.id) {
    throw new MediaError("invalid_kind", "Mux did not return an upload URL")
  }
  return {
    uploadUrl: upload.url,
    uploadMethod: "PUT",
    uploadHeaders: { "Content-Type": "application/octet-stream" },
    providerRef: upload.id,
  }
}
