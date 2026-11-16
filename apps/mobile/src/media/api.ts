import type { MediaStatusOutput } from "@workspace/schema"

import { invoke, trpc } from "@/trpc/client"

import { pickVideo, uploadImageFromUri, uploadVideoFromUri } from "./upload"

export const mediaApi = {
  pickVideo,
  uploadImageFromUri,
  uploadVideoFromUri,
  status(mediaId: string) {
    return invoke(() => trpc.media.status.query({ mediaId })) as Promise<MediaStatusOutput>
  },
  delete(mediaId: string) {
    return invoke(() => trpc.media.delete.mutate({ mediaId }))
  },
}
