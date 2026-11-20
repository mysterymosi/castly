import { router, useLocalSearchParams } from "expo-router"
import { useEffect } from "react"

import { MediaViewer } from "@/inbox/media-viewer"
import type { MediaViewerParams } from "@/inbox/navigation"

function close() {
  if (router.canGoBack()) router.back()
  else router.replace("/inbox")
}

export default function MediaViewerRoute() {
  const params = useLocalSearchParams<Record<keyof MediaViewerParams, string>>()
  const valid = !!params.uri && (params.kind === "image" || params.kind === "video")

  // A malformed link has nothing to show.
  useEffect(() => {
    if (!valid) close()
  }, [valid])

  if (!valid) return null
  return (
    <MediaViewer
      params={{ ...params, kind: params.kind as MediaViewerParams["kind"], uri: params.uri }}
      onClose={close}
    />
  )
}
