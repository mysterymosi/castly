import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from "expo-router/ui"
import { forwardRef } from "react"
import { Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Icon, type IconName } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { cn } from "@/lib/cn"

export default function AppTabs() {
  const insets = useSafeAreaInsets()
  const { color } = useTokens()
  return (
    <Tabs style={{ flex: 1, backgroundColor: color.bg }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View
          className="flex-row justify-center gap-2 border-t border-border bg-surface px-4 pt-1"
          style={{ paddingBottom: Math.max(insets.bottom, 6) }}
        >
          <TabTrigger name="studio" href="/studio" asChild>
            <TabButton icon="studio" label="Studio" />
          </TabTrigger>
          <TabTrigger name="projects" href="/projects" asChild>
            <TabButton icon="film" label="Projects" />
          </TabTrigger>
          <TabTrigger name="account" href="/account" asChild>
            <TabButton icon="person" label="Account" />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  )
}

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; label: string }

const TabButton = forwardRef<View, TabButtonProps>(function TabButton(
  { icon, label, isFocused, ...props },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      className="min-h-14 flex-1 items-center justify-center gap-1 rounded-lg active:opacity-70"
      style={{ maxWidth: 160 }}
    >
      <View className={cn("rounded-pill px-5 py-1", isFocused && "bg-accent")}>
        <Icon name={icon} size={20} tone={isFocused ? "onAccent" : "textMuted"} />
      </View>
      <Text variant="caption" tone={isFocused ? "default" : "muted"} className="normal-case tracking-normal">
        {label}
      </Text>
    </Pressable>
  )
})
