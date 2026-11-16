import type { PickedImage } from "@/media/upload"

/** Every photo is cut to 4:5 (width ÷ height), the shape the card shows photos in. */
export const CROP_ASPECT = 4 / 5
export const MAX_ZOOM = 4

/** Zoom 1 just covers the frame; tx and ty move the image centre, in frame points. */
export type Framing = { zoom: number; tx: number; ty: number }
export const centred: Framing = { zoom: 1, tx: 0, ty: 0 }

export function clamp(value: number, low: number, high: number) {
  "worklet"
  return Math.min(high, Math.max(low, value))
}

/** The image's size when it just covers the frame (zoom 1), and the scale that takes it there. */
export function coverSize(image: Pick<PickedImage, "width" | "height">, frameW: number, frameH: number) {
  const base = Math.max(frameW / image.width, frameH / image.height)
  return { base, w: image.width * base, h: image.height * base }
}

/** The part of the photo inside the frame, in the photo's own pixels. */
export function cropRect(
  image: Pick<PickedImage, "width" | "height">,
  framing: Framing,
  frameW: number,
  frameH: number
) {
  const scale = coverSize(image, frameW, frameH).base * framing.zoom
  const width = Math.min(image.width, frameW / scale)
  const height = Math.min(image.height, frameH / scale)
  const originX = clamp(image.width / 2 - (frameW / 2 + framing.tx) / scale, 0, image.width - width)
  const originY = clamp(image.height / 2 - (frameH / 2 + framing.ty) / scale, 0, image.height - height)
  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.round(width),
    height: Math.round(height),
  }
}
