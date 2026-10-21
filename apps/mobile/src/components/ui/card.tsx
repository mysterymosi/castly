import { shadow } from "@workspace/ui-tokens"
import { StyleSheet, View, type ViewProps } from "react-native"

import { PressableScale, type PressableScaleProps } from "@/components/ui/pressable-scale"
import { cn } from "@/lib/cn"

const base = "rounded-xl border border-border bg-surface p-5"

export function Card({ className, style, ...rest }: ViewProps & { className?: string }) {
  return (
    <View className={cn(base, className)} style={StyleSheet.flatten([{ boxShadow: shadow.card }, style])} {...rest} />
  )
}

export function PressableCard({ className, style, ...rest }: PressableScaleProps) {
  return (
    <PressableScale
      pressedScale={0.985}
      haptic="selection"
      className={cn(base, className)}
      style={StyleSheet.flatten([{ boxShadow: shadow.card }, style as never])}
      {...rest}
    />
  )
}
