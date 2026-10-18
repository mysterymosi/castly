import type { MediaStatusOutput } from "@workspace/schema"

import { invoke, trpc } from "@/trpc/client"

import { pickVideo, uploadImageFromUri, uploadQuickStartPhotos, uploadVideoFromUri } from "./upload"

export const mediaApi = {
  pickVideo,
  uploadImageFromUri,
  uploadVideoFromUri,
  uploadQuickStartPhotos,
  status(mediaId: string) {
    return invoke(() => trpc.media.status.query({ mediaId })) as Promise<MediaStatusOutput>
  },
  delete(mediaId: string) {
    return invoke(() => trpc.media.delete.mutate({ mediaId }))
  },
}
