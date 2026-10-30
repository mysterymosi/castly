import { useCallback } from "react"
import { useFrameCallback, useSharedValue } from "react-native-reanimated"

import { logMeasure, measureEnabled } from "@/lib/measure"

/** A frame slower than this misses the §25 scroll budget (sustained ≥ 55fps). */
const SLOW_FRAME_MS = 1000 / 55

/**
 * UI-thread frame timing between `start` and `stop`, logged as one `[measure] <event>` line:
 * average fps, the worst frame, and how many frames ran slower than 55fps. Inert unless
 * EXPO_PUBLIC_MEASURE=1. It sees the UI thread only — the thread that draws native scrolling;
 * JS-thread stalls show up as blank list cells, not here.
 */
export function useFrameMeter(event: string) {
  const frames = useSharedValue(0)
  const elapsed = useSharedValue(0)
  const worst = useSharedValue(0)
  const slow = useSharedValue(0)

  const meter = useFrameCallback((info) => {
    "worklet"
    const dt = info.timeSincePreviousFrame
    if (dt === null) return
    frames.set(frames.get() + 1)
    elapsed.set(elapsed.get() + dt)
    if (dt > worst.get()) worst.set(dt)
    if (dt > SLOW_FRAME_MS) slow.set(slow.get() + 1)
  }, false)

  const start = useCallback(() => {
    if (!measureEnabled || meter.isActive) return
    frames.set(0)
    elapsed.set(0)
    worst.set(0)
    slow.set(0)
    meter.setActive(true)
  }, [meter, frames, elapsed, worst, slow])

  const stop = useCallback(() => {
    if (!meter.isActive) return
    meter.setActive(false)
    const count = frames.get()
    const ms = elapsed.get()
    // A tap-length scroll says nothing about sustained fps.
    if (count < 10 || ms === 0) return
    logMeasure(event, {
      fps: Math.round((count * 1000) / ms),
      frames: count,
      worstFrameMs: Math.round(worst.get()),
      slowFrames: slow.get(),
      durationMs: Math.round(ms),
    })
  }, [meter, event, frames, elapsed, worst, slow])

  return { start, stop }
}
