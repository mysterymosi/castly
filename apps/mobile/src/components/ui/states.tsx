import { useEffect } from "react"
import { ActivityIndicator, View } from "react-native"
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"

import { AnimatedView } from "@/components/ui/animated"
import { Button } from "@/components/ui/button"
import { Icon, type IconName } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { cn } from "@/lib/cn"

export function LoadingState({ label = "Loading" }: { label?: string }) {
  const { color } = useTokens()
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6" accessibilityLabel={label}>
      <ActivityIndicator color={color.text} />
      <Text variant="footnote" tone="muted">
        {label}
      </Text>
    </View>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  className,
}: {
  icon: IconName
  title: string
  body?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}) {
  return (
    <View className={cn("items-center gap-3 px-6 py-10", className)}>
      <View className="h-14 w-14 items-center justify-center rounded-pill bg-surfaceMuted">
        <Icon name={icon} size={24} tone="textMuted" />
      </View>
      <Text variant="title-sm" className="text-center">
        {title}
      </Text>
      {body ? (
        <Text variant="body-sm" tone="muted" className="text-center">
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} size="md" variant="secondary" onPress={onAction} className="mt-2" />
      ) : null}
    </View>
  )
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <View className={cn("flex-1 items-center justify-center gap-3 px-6", className)} accessibilityRole="alert">
      <View className="h-14 w-14 items-center justify-center rounded-pill bg-surfaceMuted">
        <Icon name="warning" size={24} tone="passText" />
      </View>
      <Text variant="title-sm" className="text-center">
        Something went wrong
      </Text>
      <Text variant="body-sm" tone="muted" className="text-center">
        {message}
      </Text>
      {onRetry ? (
        <Button label="Try again" icon="refresh" size="md" variant="secondary" onPress={onRetry} className="mt-2" />
      ) : null}
    </View>
  )
}

/** Inline error banner for failures that don't replace the whole screen. */
export function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn("flex-row items-start gap-2 rounded-lg border border-passText/40 bg-pass/10 p-3", className)}
    >
      <Icon name="warning" size={16} tone="passText" />
      <Text variant="body-sm" tone="pass" className="flex-1">
        {message}
      </Text>
    </View>
  )
}

export function Skeleton({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(0.55)

  useEffect(() => {
    if (reduceMotion) return
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true)
  }, [opacity, reduceMotion])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <AnimatedView className={cn("rounded-lg bg-surfaceMuted", className)} style={style} />
}
