import { useState } from "react"
import { Pressable, View } from "react-native"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/cn"
import { setDataSaver, useDataSaver, useOfferDataSaver } from "@/media/data-saver"

/** The deck's one-tap data-saver switch, beside the screen title (TECH_SPEC §10.3). */
export function DataSaverToggle() {
  const on = useDataSaver()
  return (
    <PressableScale
      haptic="selection"
      accessibilityRole="switch"
      accessibilityLabel="Data saver"
      accessibilityHint="Loads showreels at low quality, only when you tap play"
      accessibilityState={{ checked: on }}
      onPress={() => setDataSaver(!on)}
      hitSlop={6}
      className={cn(
        "min-h-9 flex-row items-center gap-1.5 rounded-pill px-3",
        on ? "bg-inverse" : "border border-border bg-surface",
      )}
    >
      <Icon name="data-saver" size={14} tone={on ? "onInverse" : "textMuted"} />
      <Text variant="body-sm" tone={on ? "onInverse" : "muted"}>
        {on ? "Data saver on" : "Data saver"}
      </Text>
    </PressableScale>
  )
}

/**
 * Offered when the connection is metered or slow and data-saver is off. Dismissed for the
 * session; the header switch stays one tap away.
 */
export function DataSaverOffer() {
  const offer = useOfferDataSaver()
  const [dismissed, setDismissed] = useState(false)
  if (!offer || dismissed) return null
  return (
    <View className="mx-3 mb-3 flex-row items-center gap-3 rounded-lg border border-border bg-surface py-2.5 pl-4 pr-2">
      <Icon name="data-saver" size={18} tone="textMuted" />
      <Text variant="body-sm" className="flex-1">
        On mobile data? Data saver plays showreels at low quality, only when you tap.
      </Text>
      <Button label="Turn on" size="md" variant="inverse" className="px-4" onPress={() => setDataSaver(true)} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        onPress={() => setDismissed(true)}
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-pill active:opacity-70"
      >
        <Icon name="close" size={14} tone="textMuted" />
      </Pressable>
    </View>
  )
}
