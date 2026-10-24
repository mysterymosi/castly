/**
 * Device measurement logging (M2 task 2.10). Enabled with EXPO_PUBLIC_MEASURE=1 at bundle time;
 * a no-op otherwise. Lines are `[measure] <event> <json>` so they can be grepped out of
 * `adb logcat -s ReactNativeJS` or the Metro log.
 */
export const measureEnabled = process.env.EXPO_PUBLIC_MEASURE === "1"

let previewRequestedAt: number | null = null

export function logMeasure(
  event: string,
  data: Record<string, number | string | null>
) {
  if (!measureEnabled) return
  console.log(`[measure] ${event} ${JSON.stringify(data)}`)
}

/** Call right before navigating to the preview, so first-frame time starts at the tap. */
export function markPreviewRequested() {
  if (measureEnabled) previewRequestedAt = Date.now()
}

/** Reads and clears the tap timestamp set by `markPreviewRequested`. */
export function takePreviewRequestedAt() {
  const at = previewRequestedAt
  previewRequestedAt = null
  return at
}
