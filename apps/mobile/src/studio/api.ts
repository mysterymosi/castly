import { studioStateSchema, type StudioState } from "@workspace/schema"

import { invoke, trpc } from "@/trpc/client"

function asStudioState(data: unknown): StudioState {
  return studioStateSchema.parse(data)
}

export const studioApi = {
  get() {
    return invoke(async () =>
      asStudioState(await trpc.talent.studio.get.query())
    )
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
  setAttribute(definitionKey: string, valueText: string) {
    return invoke(async () =>
      asStudioState(
        await trpc.talent.attributes.set.mutate({ definitionKey, valueText })
      )
    )
  },
}
