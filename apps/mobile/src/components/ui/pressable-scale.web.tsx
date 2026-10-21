import "./focus-ring.css"

import { motion } from "@workspace/ui-tokens"
import { useState } from "react"
import { Pressable, StyleSheet, type PressableProps } from "react-native"
import { useReducedMotion } from "react-native-reanimated"

import { haptics } from "@/lib/haptics"

export type PressableScaleProps = PressableProps & {
  className?: string
  pressedScale?: number
  haptic?: "tap" | "selection" | false
}

/**
 * Web variant: Reanimated's web style merging keeps stale NativeWind class objects when
 * `className` changes, so web uses a plain Pressable. The focus ring comes from
 * `:focus-visible` CSS because browsers drop focus without a blur event when a control
 * becomes disabled.
 */
export function PressableScale({
  pressedScale = motion.pressScale,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  style,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion()
  const [pressed, setPressed] = useState(false)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={(event) => {
        setPressed(true)
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        setPressed(false)
        onPressOut?.(event)
      }}
      onPress={(event) => {
        if (haptic) haptics[haptic]()
        onPress?.(event)
      }}
      // A flat object, never an array: NativeWind's web runtime pushes its class object into
      // style arrays, which accumulates stale classes when the array is memoized.
      style={StyleSheet.flatten([
        pressed && !reduceMotion ? { transform: [{ scale: pressedScale }] } : null,
        style as never,
      ])}
      {...rest}
    />
  )
}
