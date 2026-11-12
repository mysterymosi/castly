import type { PickedImage } from "@/media/upload"

/**
 * Hands picked photos to the crop screen (`studio/crop`), which uploads them once cropped. A
 * list of local files doesn't fit in route params, so it waits here for one read.
 */
export type PendingCrop = {
  images: PickedImage[]
  /** The slot the first image lands in; slot 0 is Main, which the crop screen marks. */
  firstSlot: number
  /** Replacing this photo: one image, which takes its slot. */
  replaceMediaId?: string
}

let pending: PendingCrop | null = null

export function setPendingCrop(next: PendingCrop) {
  pending = next
}

export function takePendingCrop(): PendingCrop | null {
  const next = pending
  pending = null
  return next
}
