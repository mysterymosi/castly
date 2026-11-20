import { fontFamily } from "@workspace/ui-tokens"
import { NativeTabs } from "expo-router/unstable-native-tabs"

import { useTokens } from "@/hooks/use-tokens"
import { useActiveMode } from "@/mode/active-mode"

/**
 * One mode's tabs at a time: talent sees the studio, bookers the deck and projects; Account, where
 * the mode switches, is in both. Hidden tabs can't be navigated to, so a mode's screens stay out of
 * the other mode entirely.
 */
export default function AppTabs() {
  const { color } = useTokens()
  const mode = useActiveMode()
  const talent = mode === "talent"

  return (
    <NativeTabs
      // Back never lands on a tab the current mode hides: the default returns to the initial route
      // (`inbox`), and a mode's own tabs are the only ones it should reach.
      backBehavior="none"
      backgroundColor={color.surface}
      indicatorColor={color.accent}
      tintColor={color.text}
      iconColor={{ default: color.textMuted, selected: color.text }}
      labelStyle={{
        default: {
          color: color.textMuted,
          fontFamily: fontFamily.bodySemibold,
          fontSize: 11,
        },
        selected: {
          color: color.text,
          fontFamily: fontFamily.bodyBold,
          fontSize: 11,
        },
      }}
      rippleColor={color.surfaceMuted}
    >
      <NativeTabs.Trigger name="studio" hidden={!talent}>
        <NativeTabs.Trigger.Label>Studio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="dashboard"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="discover" hidden={talent}>
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "rectangle.stack", selected: "rectangle.stack.fill" }}
          md="style"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="projects" hidden={talent}>
        <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "folder", selected: "folder.fill" }}
          md="folder"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }}
          md="forum"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "person.crop.circle",
            selected: "person.crop.circle.fill",
          }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
