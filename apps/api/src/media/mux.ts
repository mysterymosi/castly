import { MediaError } from "./errors.js"
import { muxClient, muxCorsOrigin } from "./mux-client.js"

type MuxUploadResult = {
  uploadUrl: string
  uploadMethod: "PUT"
  uploadHeaders: Record<string, string>
  providerRef: string
}

export async function createMuxVideoUpload(mediaId: string): Promise<MuxUploadResult> {
  const mux = muxClient()
  const upload = await mux.video.uploads.create({
    cors_origin: muxCorsOrigin(),
    timeout: 3600,
    new_asset_settings: {
      passthrough: mediaId,
      playback_policies: ["public"],
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
