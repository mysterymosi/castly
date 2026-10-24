import type { MediaStatusOutput } from "@workspace/schema"

import type {
  PortfolioImageProps,
  PortfolioMediaComponents,
  PortfolioMediaMeta,
  PortfolioRenderContext,
  PortfolioVideoProps,
} from "./types"

/** Renderer media meta from media status rows. Only `ready` media is renderable. */
export function mediaMetaFromStatus(
  media: Record<string, MediaStatusOutput>
): PortfolioMediaMeta {
  const meta: PortfolioMediaMeta = {}
  for (const [id, item] of Object.entries(media)) {
    if (item.status !== "ready") continue
    meta[id] = {
      width: item.width ?? undefined,
      height: item.height ?? undefined,
      cardUrl: item.variants?.card ?? null,
      fullUrl: item.variants?.full ?? null,
      posterUrl: item.posterUrl,
      playbackUrl: item.playbackUrl,
    }
  }
  return meta
}

function PortfolioImage({ priority, ...props }: PortfolioImageProps) {
  return (
    <img
      {...props}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  )
}

/**
 * Server-rendered HLS. Safari, iOS, Android, and current desktop Chrome play the manifest
 * natively; hosts that need wider coverage pass an hls.js `Video` through `components`.
 */
function PortfolioVideo({
  playbackUrl,
  posterUrl,
  title,
  className,
  loop,
}: PortfolioVideoProps) {
  return (
    <video
      className={className}
      poster={posterUrl ?? undefined}
      title={title}
      playsInline
      preload={loop ? "auto" : "none"}
      {...(loop
        ? { autoPlay: true, muted: true, loop: true }
        : { controls: true })}
    >
      <source src={playbackUrl} type="application/vnd.apple.mpegurl" />
    </video>
  )
}

export const defaultMediaComponents: PortfolioMediaComponents = {
  Image: PortfolioImage,
  Video: PortfolioVideo,
}

type SectionImageProps = {
  mediaId: string | null | undefined
  context: PortfolioRenderContext
  alt: string
  sizes: string
  className?: string
  priority?: boolean
}

/** Image for `mediaId` at its intrinsic aspect ratio, or null when the media is not ready. */
export function SectionImage({
  mediaId,
  context,
  alt,
  sizes,
  className,
  priority,
}: SectionImageProps) {
  const meta = mediaId ? context.mediaMeta[mediaId] : undefined
  const src = meta?.cardUrl ?? meta?.fullUrl
  if (!meta || !src) return null
  const srcSet = [
    meta.cardUrl ? `${meta.cardUrl} 480w` : null,
    meta.fullUrl ? `${meta.fullUrl} 2048w` : null,
  ]
    .filter(Boolean)
    .join(", ")
  const { Image } = context.components
  return (
    <Image
      src={src}
      srcSet={srcSet || undefined}
      sizes={sizes}
      alt={alt}
      width={meta.width}
      height={meta.height}
      priority={priority}
      className={["bg-muted block h-auto w-full object-cover", className]
        .filter(Boolean)
        .join(" ")}
    />
  )
}

/** Video for `mediaId`, falling back to its poster; null when neither is available. */
export function SectionVideo({
  mediaId,
  context,
  title,
  className,
  loop,
}: {
  mediaId: string | null | undefined
  context: PortfolioRenderContext
  title: string
  className?: string
  loop?: boolean
}) {
  const meta = mediaId ? context.mediaMeta[mediaId] : undefined
  const { Image, Video } = context.components
  if (meta?.playbackUrl) {
    return (
      <Video
        playbackUrl={meta.playbackUrl}
        posterUrl={meta.posterUrl}
        title={title}
        loop={loop}
        className={["bg-foreground block aspect-video w-full", className]
          .filter(Boolean)
          .join(" ")}
      />
    )
  }
  if (meta?.posterUrl) {
    return (
      <Image
        src={meta.posterUrl}
        alt={title}
        className={["bg-muted block aspect-video w-full object-cover", className]
          .filter(Boolean)
          .join(" ")}
      />
    )
  }
  return null
}
