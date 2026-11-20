import { router } from "expo-router"

export function openChat(matchId: string) {
  router.push({ pathname: "/chat/[matchId]", params: { matchId } })
}

/** The role brief for a match, as a sheet over the chat. */
export function openBrief(matchId: string) {
  router.push({ pathname: "/brief/[matchId]", params: { matchId } })
}

export type MediaViewerParams = {
  kind: "image" | "video"
  uri: string
  poster?: string
  blurhash?: string
  caption?: string
  /** Who sent it and when, shown in the viewer's top bar. */
  title?: string
  subtitle?: string
}

/** A chat photo or video, full screen. */
export function openMedia(params: MediaViewerParams) {
  const defined = Object.fromEntries(Object.entries(params).filter(([, value]) => !!value))
  router.push({ pathname: "/media-viewer", params: defined })
}
