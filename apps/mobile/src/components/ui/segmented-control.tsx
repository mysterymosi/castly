import { View } from "react-native"

import { PressableScale } from "@/components/ui/pressable-scale"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/cn"

type Option<T extends string> = { value: T; label: string }

/** Bumble's "Basic | Advanced" pill toggle. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly Option<T>[]
  value: T
  onChange: (next: T) => void
  className?: string
}) {
  return (
    <View accessibilityRole="tablist" className={cn("flex-row self-center rounded-pill bg-surfaceMuted p-1", className)}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <PressableScale
            key={option.value}
            haptic="selection"
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            className={cn("min-h-11 justify-center rounded-pill px-5", selected ? "bg-inverse" : "bg-transparent")}
          >
            <Text variant="label" tone={selected ? "onInverse" : "default"}>
              {option.label}
            </Text>
          </PressableScale>
        )
      })}
    </View>
  )
}
