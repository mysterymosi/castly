import { ActivityIndicator, View } from "react-native"

import { Icon, type IconName } from "@/components/ui/icon"
import { PressableScale, type PressableScaleProps } from "@/components/ui/pressable-scale"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { cn } from "@/lib/cn"

const variants = {
  primary: { container: "bg-accent", text: "onAccent", icon: "onAccent" },
  inverse: { container: "bg-inverse", text: "onInverse", icon: "onInverse" },
  secondary: { container: "bg-surface border border-borderStrong", text: "default", icon: "text" },
  ghost: { container: "bg-transparent", text: "default", icon: "text" },
  destructive: { container: "bg-pass", text: "onPass", icon: "onPass" },
} as const

type ButtonProps = Omit<PressableScaleProps, "children"> & {
  label: string
  variant?: keyof typeof variants
  size?: "lg" | "md"
  loading?: boolean
  icon?: IconName
  iconPosition?: "left" | "right"
}

export function Button({
  label,
  variant = "primary",
  size = "lg",
  loading = false,
  disabled,
  icon,
  iconPosition = "left",
  className,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const { color } = useTokens()
  const v = variants[variant]
  const inactive = disabled || loading
  const iconEl = icon ? <Icon name={icon} size={18} tone={v.icon} /> : null
  const spinnerColor =
    variant === "primary" ? color.onAccent : variant === "inverse" ? color.onInverse : color.text

  return (
    <PressableScale
      haptic="tap"
      disabled={inactive}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      className={cn(
        "flex-row items-center justify-center gap-2 rounded-pill px-6",
        size === "lg" ? "min-h-14" : "min-h-11",
        v.container,
        disabled && !loading && "opacity-50",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View className="flex-row items-center gap-2">
          {iconPosition === "left" ? iconEl : null}
          <Text variant={size === "lg" ? "body-strong" : "label"} tone={v.text} numberOfLines={1}>
            {label}
          </Text>
          {iconPosition === "right" ? iconEl : null}
        </View>
      )}
    </PressableScale>
  )
}
