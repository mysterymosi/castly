import { DateTimePicker } from "@expo/ui/community/datetime-picker"
import { useState } from "react"
import { Platform, View } from "react-native"

import { Button } from "@/components/ui/button"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"

/** `YYYY-MM-DD` ↔ a local calendar day, so a picked day never shifts across time zones. */
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y!, m! - 1, d!)
}

function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const display = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" })

type DateFieldProps = {
  label: string
  /** `YYYY-MM-DD`, or null when unset. */
  value: string | null
  onChange: (value: string | null) => void
  minimumDate?: string | null
}

/**
 * Optional date with a native picker (`@expo/ui`): a dialog on Android, an inline calendar on iOS.
 * The field shows the chosen day and a clear action.
 */
export function DateField({ label, value, onChange, minimumDate }: DateFieldProps) {
  const { color } = useTokens()
  const [open, setOpen] = useState(false)
  const min = minimumDate ? toDate(minimumDate) : undefined
  const current = value ? toDate(value) : (min ?? new Date())

  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row items-center gap-2">
        <PressableScale
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? display.format(toDate(value)) : "not set"}`}
          accessibilityHint="Opens a date picker"
          onPress={() => setOpen((o) => !o)}
          className="min-h-12 flex-1 flex-row items-center gap-2 rounded-lg border border-borderStrong bg-surface px-4"
        >
          <Icon name="calendar" size={16} tone="textMuted" />
          <Text variant="body" tone={value ? "default" : "muted"}>
            {value ? display.format(toDate(value)) : "Not set"}
          </Text>
        </PressableScale>
        {value ? (
          <Button label="Clear" variant="ghost" size="md" onPress={() => onChange(null)} />
        ) : null}
      </View>
      {open ? (
        <DateTimePicker
          value={current}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={min}
          accentColor={color.accent}
          onValueChange={(_event, date) => {
            onChange(toIso(date))
            setOpen(false)
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </View>
  )
}
