import { studioStateSchema, type StudioState } from "@workspace/schema"

import { logMeasure, measureEnabled } from "@/lib/measure"
import { invoke, trpc } from "@/trpc/client"

/**
 * `talent.studio.get`, timed for the M2.10 measurement log. Unwrapped (no `invoke`) so it can be
 * the studio query's `queryFn`: errors stay `TRPCClientError`, which the retry policy reads.
 */
export async function fetchStudioState() {
  const startedAt = Date.now()
  const data = await trpc.talent.studio.get.query()
  if (measureEnabled) {
    logMeasure("studio.get", {
      ms: Math.round(Date.now() - startedAt),
      jsonBytes: JSON.stringify(data).length,
      mediaCount: Object.keys(data.media).length,
    })
  }
  return data
}

export function asStudioState(data: unknown): StudioState {
  return studioStateSchema.parse(data)
}

export const studioApi = {
  get() {
    return invoke(async () => asStudioState(await fetchStudioState()))
  },
  updateProfile(
    input: Parameters<typeof trpc.talent.studio.updateProfile.mutate>[0]
  ) {
    return invoke(async () =>
      asStudioState(await trpc.talent.studio.updateProfile.mutate(input))
    )
  },
  completeQuickStart(
    input: Parameters<typeof trpc.talent.studio.completeQuickStart.mutate>[0]
  ) {
    return invoke(async () =>
      asStudioState(await trpc.talent.studio.completeQuickStart.mutate(input))
    )
  },
  createPlaceholderPhotos(count = 3) {
    return invoke(() =>
      trpc.talent.studio.createPlaceholderPhotos.mutate({ count })
    )
  },
  createSection(
    type: Parameters<typeof trpc.talent.sections.create.mutate>[0]["type"]
  ) {
    return invoke(async () =>
      asStudioState(await trpc.talent.sections.create.mutate({ type }))
    )
  },
  updateSection(input: Parameters<typeof trpc.talent.sections.update.mutate>[0]) {
    return invoke(async () =>
      asStudioState(await trpc.talent.sections.update.mutate(input))
    )
  },
  deleteSection(sectionId: string) {
    return invoke(async () =>
      asStudioState(await trpc.talent.sections.delete.mutate({ sectionId }))
    )
  },
  reorderSections(sectionIds: string[]) {
    return invoke(async () =>
      asStudioState(await trpc.talent.sections.reorder.mutate({ sectionIds }))
    )
  },
  applyTemplate(
    templateId: Parameters<
      typeof trpc.talent.sections.applyTemplate.mutate
    >[0]["templateId"]
  ) {
    return invoke(async () =>
      asStudioState(
        await trpc.talent.sections.applyTemplate.mutate({ templateId })
      )
    )
  },
  publish() {
    return invoke(async () =>
      asStudioState(await trpc.talent.studio.publish.mutate())
    )
  },
  unpublish() {
    return invoke(async () =>
      asStudioState(await trpc.talent.studio.unpublish.mutate())
    )
  },
  setAttribute(definitionKey: string, valueText: string) {
    return invoke(async () =>
      asStudioState(
        await trpc.talent.attributes.set.mutate({ definitionKey, valueText })
      )
    )
  },
}
