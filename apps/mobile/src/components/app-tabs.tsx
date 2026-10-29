import { fontFamily } from "@workspace/ui-tokens"
import { NativeTabs } from "expo-router/unstable-native-tabs"

import { useTokens } from "@/hooks/use-tokens"

export default function AppTabs() {
  const { color } = useTokens()

  return (
    <NativeTabs
      backgroundColor={color.surface}
      indicatorColor={color.accent}
      tintColor={color.text}
      iconColor={{ default: color.textMuted, selected: color.text }}
      labelStyle={{
        default: { color: color.textMuted, fontFamily: fontFamily.bodyMedium, fontSize: 11 },
        selected: { color: color.text, fontFamily: fontFamily.bodySemibold, fontSize: 11 },
      }}
      rippleColor={color.surfaceMuted}
    >
      <NativeTabs.Trigger name="studio">
        <NativeTabs.Trigger.Label>Studio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="dashboard"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="projects">
        <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "folder", selected: "folder.fill" }} md="folder" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
