import { motion } from "@workspace/ui-tokens"
import { useState } from "react"
import { Pressable, type PressableProps } from "react-native"
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import { useTokens } from "@/hooks/use-tokens"
import { haptics } from "@/lib/haptics"

export type PressableScaleProps = PressableProps & {
  className?: string
  /** Scale target while pressed. */
  pressedScale?: number
  haptic?: "tap" | "selection" | false
}

/**
 * Pressable with token-timed scale feedback.
 * The scale lives on a plain animated wrapper. Putting a Reanimated style on the same
 * view as `className` makes NativeWind drop the background, which hides light text.
 */
export function PressableScale({
  pressedScale = motion.pressScale,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  onFocus,
  onBlur,
  disabled,
  style,
  className,
  children,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion()
  const { color } = useTokens()
  const pressed = useSharedValue(0)
  const [focused, setFocused] = useState(false)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * (1 - pressedScale) }],
  }))

  return (
    <Animated.View style={[animatedStyle, { width: "100%" }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        className={className}
        onPressIn={(event) => {
          pressed.value = withTiming(1, { duration: motion.fast })
          onPressIn?.(event)
        }}
        onPressOut={(event) => {
          pressed.value = withTiming(0, { duration: motion.base })
          onPressOut?.(event)
        }}
        onPress={(event) => {
          if (haptic) haptics[haptic]()
          onPress?.(event)
        }}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        style={[
          focused
            ? { outlineColor: color.focus, outlineWidth: 2, outlineOffset: 2, outlineStyle: "solid" }
            : null,
          style as never,
        ]}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}
