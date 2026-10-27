import { SectionImage, SectionVideo } from "../media"
import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, WebSectionProps } from "../types"

type HeroConfig = CoreSectionConfigMap["hero"]

function HeroMedia({
  config,
  context,
  className,
  sizes,
}: WebSectionProps<HeroConfig> & { className: string; sizes: string }) {
  const meta = config.mediaId ? context.mediaMeta[config.mediaId] : undefined
  const alt = config.headline ?? "Portfolio cover"
  if (meta?.playbackUrl || (meta?.posterUrl && !meta.cardUrl)) {
    return (
      <SectionVideo
        mediaId={config.mediaId}
        context={context}
        title={alt}
        loop={config.style === "video_loop"}
        className={className}
      />
    )
  }
  return (
    <SectionImage
      mediaId={config.mediaId}
      context={context}
      alt={alt}
      sizes={sizes}
      className={className}
      priority
    />
  )
}

function HeroText({ config }: { config: HeroConfig }) {
  return (
    <div className="min-w-0">
      {config.headline ? (
        <p className="font-heading text-foreground text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {config.headline}
        </p>
      ) : null}
      {config.subtitle ? (
        <p className="text-muted-foreground mt-2 text-base text-pretty">
          {config.subtitle}
        </p>
      ) : null}
    </div>
  )
}

/** Badges (verification, Pro) are not rendered until their data exists; `showBadges` is honoured then. */
export function HeroSection({ config, context }: WebSectionProps<HeroConfig>) {
  const hasMedia = Boolean(config.mediaId && context.mediaMeta[config.mediaId])
  if (!hasMedia && !config.headline && !config.subtitle) return null

  if (config.style === "split") {
    return (
      <SectionShell type="hero" className="grid items-center gap-6 sm:grid-cols-2">
        <HeroMedia
          config={config}
          context={context}
          className="rounded-xl"
          sizes="(min-width: 640px) 50vw, 100vw"
        />
        <HeroText config={config} />
      </SectionShell>
    )
  }

  if (config.style === "minimal") {
    return (
      <SectionShell type="hero" className="flex items-center gap-4">
        {hasMedia ? (
          <div className="w-24 shrink-0 overflow-hidden rounded-full sm:w-32">
            <HeroMedia
              config={config}
              context={context}
              className="aspect-square"
              sizes="128px"
            />
          </div>
        ) : null}
        <HeroText config={config} />
      </SectionShell>
    )
  }

  // full_bleed and video_loop: media spans the page width, text below.
  return (
    <SectionShell type="hero" className="px-0 pt-0 sm:px-0">
      <HeroMedia
        config={config}
        context={context}
        className="max-h-[80svh] sm:rounded-b-xl"
        sizes="100vw"
      />
      <div className="mt-6 px-4 sm:px-6">
        <HeroText config={config} />
      </div>
    </SectionShell>
  )
}
