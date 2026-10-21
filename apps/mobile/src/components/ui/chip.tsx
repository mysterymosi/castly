import { View } from "react-native"

import { Icon, type IconName } from "@/components/ui/icon"
import { PressableScale, type PressableScaleProps } from "@/components/ui/pressable-scale"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/cn"

type ChipProps = Omit<PressableScaleProps, "children"> & {
  label: string
  selected?: boolean
  icon?: IconName
}

/** Selectable pill (Bumble's filter chips): ink when selected, muted surface otherwise. */
export function Chip({ label, selected = false, icon, className, disabled, ...rest }: ChipProps) {
  return (
    <PressableScale
      haptic="selection"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      className={cn(
        "min-h-11 flex-row items-center gap-1.5 rounded-pill px-4",
        selected ? "bg-inverse" : "bg-surfaceMuted",
        disabled && !selected && "opacity-40",
        className,
      )}
      {...rest}
    >
      {selected ? <Icon name="check" size={14} tone="onInverse" /> : icon ? <Icon name={icon} size={14} /> : null}
      <Text variant="label" tone={selected ? "onInverse" : "default"}>
        {label}
      </Text>
    </PressableScale>
  )
}

/** Non-interactive fact pill, e.g. highlight facts on the decision card. */
export function Tag({
  label,
  icon,
  className,
  inverted = false,
}: {
  label: string
  icon?: IconName
  className?: string
  inverted?: boolean
}) {
  return (
    <View
      className={cn(
        "min-h-8 flex-row items-center gap-1.5 self-start rounded-pill px-3 py-1",
        inverted ? "bg-inverse/70" : "bg-surfaceMuted",
        className,
      )}
    >
      {icon ? <Icon name={icon} size={13} tone={inverted ? "onInverse" : "textMuted"} /> : null}
      <Text variant="footnote" tone={inverted ? "onInverse" : "default"} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
