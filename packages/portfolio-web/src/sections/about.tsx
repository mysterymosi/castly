import { SectionImage } from "../media"
import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, WebSectionProps } from "../types"

type AboutConfig = CoreSectionConfigMap["about"]

export function AboutSection({ config, context }: WebSectionProps<AboutConfig>) {
  const body = config.body?.trim()
  const hasMedia = Boolean(config.mediaId && context.mediaMeta[config.mediaId])
  if (!body && !hasMedia) return null
  return (
    <SectionShell type="about" title="About">
      {body ? (
        <p className="text-foreground max-w-prose text-base leading-relaxed whitespace-pre-line">
          {body}
        </p>
      ) : null}
      {hasMedia ? (
        <SectionImage
          mediaId={config.mediaId}
          context={context}
          alt="About"
          sizes="(min-width: 768px) 720px, 100vw"
          className="mt-6 rounded-xl"
        />
      ) : null}
    </SectionShell>
  )
}
