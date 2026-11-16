import { useState } from "react"
import { Pressable, Switch, View } from "react-native"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { haptics } from "@/lib/haptics"
import {
  setDataSaver,
  useDataSaver,
  useOfferDataSaver,
} from "@/media/data-saver"

/** The data-saver row in deck settings (TECH_SPEC §10.3). */
export function DataSaverSetting() {
  const on = useDataSaver()
  const { color } = useTokens()
  return (
    <View className="flex-row items-center gap-4">
      <View className="rounded-pill bg-surfaceMuted h-11 w-11 items-center justify-center">
        <Icon name="data-saver" size={18} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="body-strong">Data saver</Text>
        <Text variant="footnote" tone="muted">
          Showreels load at low quality, only when you tap play
        </Text>
      </View>
      <Switch
        testID="data-saver-switch"
        accessibilityLabel="Data saver"
        value={on}
        onValueChange={(next) => {
          haptics.selection()
          setDataSaver(next)
        }}
        trackColor={{ true: color.interested, false: color.surfaceMuted }}
        ios_backgroundColor={color.surfaceMuted}
      />
    </View>
  )
}

/**
 * Offered when the connection is metered or slow and data-saver is off. Dismissed for the
 * session; the setting stays in deck settings.
 */
export function DataSaverOffer() {
  const offer = useOfferDataSaver()
  const [dismissed, setDismissed] = useState(false)
  if (!offer || dismissed) return null
  return (
    <View className="bg-surface mx-3 mb-3 flex-row items-center gap-3 rounded-lg border border-border py-2.5 pr-2 pl-4">
      <Icon name="data-saver" size={18} tone="textMuted" />
      <Text variant="body-sm" className="flex-1">
        On mobile data? Data saver plays showreels at low quality, only when you
        tap.
      </Text>
      <Button
        label="Turn on"
        size="md"
        variant="inverse"
        className="px-4"
        onPress={() => setDataSaver(true)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        onPress={() => setDismissed(true)}
        hitSlop={8}
        className="rounded-pill h-9 w-9 items-center justify-center active:opacity-70"
      >
        <Icon name="close" size={14} tone="textMuted" />
      </Pressable>
    </View>
  )
}
