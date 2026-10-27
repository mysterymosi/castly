import { SectionVideo } from "../media"
import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, WebSectionProps } from "../types"

type ShowreelConfig = CoreSectionConfigMap["showreel"]

export function ShowreelSection({ config, context }: WebSectionProps<ShowreelConfig>) {
  const meta = config.mediaId ? context.mediaMeta[config.mediaId] : undefined
  if (!meta?.playbackUrl && !meta?.posterUrl) return null
  return (
    <SectionShell type="showreel" title="Showreel">
      <SectionVideo
        mediaId={config.mediaId}
        context={context}
        title={config.headline ?? "Showreel"}
        className="overflow-hidden rounded-xl"
      />
      {config.headline ? (
        <p className="text-muted-foreground mt-3 text-sm">{config.headline}</p>
      ) : null}
    </SectionShell>
  )
}
