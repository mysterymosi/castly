import { motion, radius } from "@workspace/ui-tokens"
import { useEffect } from "react"
import { View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import { cn } from "@/lib/cn"
import { useTokens } from "@/hooks/use-tokens"

type ProgressBarProps = {
  /** 0..1 */
  value: number
  label: string
  className?: string
}

/**
 * Thin progress rail. In-flow flex row keeps the track laid out; fill width animates in pixels
 * with an explicit accent color (no Tailwind on Reanimated views).
 */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value))
  const { color } = useTokens()
  const accent = color.accent
  const progress = useSharedValue(clamped)
  const trackWidth = useSharedValue(0)

  useEffect(() => {
    progress.set(withTiming(clamped, { duration: motion.base }))
  }, [clamped, progress])

  const fillStyle = useAnimatedStyle(() => {
    const ratio = progress.get()
    const width = trackWidth.get() * ratio
    return {
      width: ratio > 0 && width > 0 ? Math.max(width, 2) : width,
      backgroundColor: accent,
    }
  }, [accent])

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      className={cn(
        "h-1.5 w-full flex-row overflow-hidden rounded-pill bg-surfaceMuted",
        className
      )}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width
        if (width > 0) trackWidth.set(width)
      }}
    >
      <Animated.View
        style={[
          {
            height: "100%",
            borderRadius: radius.pill,
          },
          fillStyle,
        ]}
      />
      {/* In-flow sibling so the track always receives width/height from the parent flex layout. */}
      <View className="h-full min-w-0 flex-1" />
    </View>
  )
}
