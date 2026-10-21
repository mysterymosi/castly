import { motion } from "@workspace/ui-tokens"
import { useEffect } from "react"
import { View } from "react-native"
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"

import { AnimatedView } from "@/components/ui/animated"
import { cn } from "@/lib/cn"

type ProgressBarProps = {
  /** 0..1 */
  value: number
  label: string
  className?: string
}

/** Bumble-style thin progress rail; animates via scaleX so layout never shifts. */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value))
  const progress = useSharedValue(clamped)

  useEffect(() => {
    progress.value = withTiming(clamped, { duration: motion.slow })
  }, [clamped, progress])

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }))

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      className={cn("h-1.5 overflow-hidden rounded-pill bg-surfaceMuted", className)}
    >
      <AnimatedView
        className="h-full w-full rounded-pill bg-accent"
        style={[{ transformOrigin: "left" }, fillStyle]}
      />
    </View>
  )
}
