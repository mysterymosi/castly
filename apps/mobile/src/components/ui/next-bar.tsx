import { ActivityIndicator, View } from "react-native"

import { Icon, type IconName } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { cn } from "@/lib/cn"

type NextBarProps = {
  onNext: () => void
  disabled?: boolean
  loading?: boolean
  /** Short reassurance shown to the left of the button. */
  note?: string
  noteIcon?: IconName
  label?: string
}

/** Bumble-style docked footer: helper note on the left, round arrow button on the right. */
export function NextBar({
  onNext,
  disabled = false,
  loading = false,
  note,
  noteIcon = "lock",
  label = "Continue",
}: NextBarProps) {
  const { color } = useTokens()
  const inactive = disabled || loading
  return (
    <View className="min-h-16 flex-row items-center gap-4">
      <View className="flex-1 flex-row items-center gap-2">
        {note ? (
          <>
            <Icon name={noteIcon} size={16} tone="textMuted" />
            <Text variant="footnote" tone="muted" className="flex-1">
              {note}
            </Text>
          </>
        ) : null}
      </View>
      <PressableScale
        haptic="tap"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onNext}
        className={cn(
          "h-14 w-14 items-center justify-center rounded-pill",
          inactive && !loading ? "bg-surfaceMuted" : "bg-accent",
        )}
      >
        {loading ? (
          <ActivityIndicator color={color.onAccent} />
        ) : (
          <Icon name="arrow-right" size={22} tone={disabled ? "textMuted" : "onAccent"} />
        )}
      </PressableScale>
    </View>
  )
}
