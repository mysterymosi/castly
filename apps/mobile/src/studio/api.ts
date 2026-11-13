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
  /** Primary first; replaces every category the talent had. */
  setCategories(categoryIds: string[]) {
    return invoke(async () =>
      asStudioState(await trpc.talent.categories.set.mutate({ categoryIds }))
    )
  },
  /** The deck card's canvas; null removes it. */
  setCanvas(mediaId: string | null) {
    return invoke(async () =>
      asStudioState(await trpc.talent.studio.setCanvas.mutate({ mediaId }))
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
  /** The showreel; null removes it. */
  setShowreel(mediaId: string | null) {
    return invoke(async () =>
      asStudioState(await trpc.talent.studio.setShowreel.mutate({ mediaId }))
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
  /** Every photo in order, Main first; leaving one out removes it. */
  setPhotos(mediaIds: string[]) {
    return invoke(async () => asStudioState(await trpc.talent.photos.set.mutate({ mediaIds })))
  },
  /** An uploaded photo into `mediaId`'s slot. */
  replacePhoto(mediaId: string, withMediaId: string) {
    return invoke(async () =>
      asStudioState(await trpc.talent.photos.replace.mutate({ mediaId, withMediaId }))
    )
  },
  /** An uploaded photo into the next free slot. */
  addPhoto(mediaId: string) {
    return invoke(async () => asStudioState(await trpc.talent.photos.add.mutate({ mediaId })))
  },
  /** One attribute; no value clears it, `isVisible` alone shows or hides it. */
  setAttribute(input: Parameters<typeof trpc.talent.attributes.set.mutate>[0]) {
    return invoke(async () => asStudioState(await trpc.talent.attributes.set.mutate(input)))
  },
  setSkills(input: Parameters<typeof trpc.talent.skills.set.mutate>[0]) {
    return invoke(async () => asStudioState(await trpc.talent.skills.set.mutate(input)))
  },
  createCredit(input: Parameters<typeof trpc.talent.credits.create.mutate>[0]) {
    return invoke(async () => asStudioState(await trpc.talent.credits.create.mutate(input)))
  },
  updateCredit(input: Parameters<typeof trpc.talent.credits.update.mutate>[0]) {
    return invoke(async () => asStudioState(await trpc.talent.credits.update.mutate(input)))
  },
  deleteCredit(creditId: string) {
    return invoke(async () => asStudioState(await trpc.talent.credits.delete.mutate({ creditId })))
  },
  reorderCredits(creditIds: string[]) {
    return invoke(async () => asStudioState(await trpc.talent.credits.reorder.mutate({ creditIds })))
  },
  setLanguages(languages: Parameters<typeof trpc.talent.languages.set.mutate>[0]["languages"]) {
    return invoke(async () => asStudioState(await trpc.talent.languages.set.mutate({ languages })))
  },
  setAccents(accentIds: string[]) {
    return invoke(async () => asStudioState(await trpc.talent.accents.set.mutate({ accentIds })))
  },
  setRates(rates: Parameters<typeof trpc.talent.rates.set.mutate>[0]["rates"]) {
    return invoke(async () => asStudioState(await trpc.talent.rates.set.mutate({ rates })))
  },
  setAvailability(months: Parameters<typeof trpc.talent.availability.set.mutate>[0]["months"]) {
    return invoke(async () => asStudioState(await trpc.talent.availability.set.mutate({ months })))
  },
}
