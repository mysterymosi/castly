import { router } from "expo-router"
import { useState } from "react"
import { ActivityIndicator, View } from "react-native"

import { authApi } from "@/auth/client"
import { errorMessage, useSession } from "@/auth/session-provider"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon, type IconName } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Screen } from "@/components/ui/screen"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { cn } from "@/lib/cn"
import { haptics } from "@/lib/haptics"
import {
  modeHome,
  setActiveMode,
  useActiveMode,
  type ActiveMode,
} from "@/mode/active-mode"
import { queryClient, trpcQuery } from "@/trpc/query-client"

const modes: Record<
  ActiveMode,
  { title: string; body: string; icon: IconName }
> = {
  talent: {
    title: "Talent",
    body: "Your studio and portfolio",
    icon: "star",
  },
  booker: {
    title: "Booker",
    body: "Discover and shortlist talent",
    icon: "briefcase",
  },
}

export default function AccountScreen() {
  const { me, refreshMe, signOut } = useSession()
  const activeMode = useActiveMode()
  const [pending, setPending] = useState<ActiveMode | "signOut" | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!me) return null

  const label = me.email ?? me.phone ?? "Your account"
  const initial = label.trim().charAt(0).toUpperCase() || "C"

  /** Switches the tab bar to `mode`, turning the mode on first if the account doesn't have it. */
  async function switchTo(mode: ActiveMode) {
    if (!me || pending) return
    if (me.modes.includes(mode)) {
      if (mode !== activeMode) enterMode(mode)
      return
    }
    setPending(mode)
    setError(null)
    try {
      await authApi.enableMode(mode)
      await refreshMe()
      await queryClient.invalidateQueries(
        mode === "booker"
          ? trpcQuery.booker.pathFilter()
          : trpcQuery.talent.pathFilter()
      )
      haptics.success()
      // Booker mode is only useful once we know what kind of work they do (PRD §6.2).
      enterMode(
        mode,
        mode === "booker" ? () => router.push("/booker-setup") : undefined
      )
    } catch (caught) {
      haptics.error()
      setError(errorMessage(caught, "Could not enable that mode"))
    } finally {
      setPending(null)
    }
  }

  async function handleSignOut() {
    setPending("signOut")
    await signOut()
  }

  return (
    <Screen scroll edges={["top"]} contentClassName="gap-6 pt-4">
      <View className="flex-row items-center justify-between">
        <Logo variant="lockup" size={28} />
      </View>

      <Card className="flex-row items-center gap-4">
        <View
          className="rounded-pill h-16 w-16 items-center justify-center bg-accent"
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="title" tone="onAccent" maxFontSizeMultiplier={1.3}>
            {initial}
          </Text>
        </View>
        <View className="flex-1 gap-1">
          <Text variant="title-sm" numberOfLines={1}>
            {label}
          </Text>
          <Text variant="footnote" tone="muted">
            {me.modes.includes(activeMode)
              ? `In ${modes[activeMode].title.toLowerCase()} mode`
              : "Choose how you'll use Castly"}
          </Text>
        </View>
      </Card>

      <View className="gap-3">
        <Text variant="caption" tone="muted">
          Mode
        </Text>
        <View className="flex-row gap-3" accessibilityRole="radiogroup">
          {(Object.keys(modes) as ActiveMode[]).map((mode) => (
            <ModeTile
              key={mode}
              mode={mode}
              selected={mode === activeMode}
              enabled={me.modes.includes(mode)}
              loading={pending === mode}
              disabled={pending !== null}
              onPress={() => void switchTo(mode)}
            />
          ))}
        </View>
        {error ? <InlineError message={error} /> : null}
        {activeMode === "booker" && me.modes.includes("booker") ? (
          <Button
            label="Booker profile"
            variant="secondary"
            size="md"
            icon="arrow-right"
            iconPosition="right"
            onPress={() => router.push("/booker-setup")}
          />
        ) : null}
      </View>

      <Button
        label="Sign out"
        variant="ghost"
        icon="logout"
        loading={pending === "signOut"}
        onPress={handleSignOut}
        className="self-center"
      />
    </Screen>
  )
}

/**
 * Shows `mode`'s tabs, then opens its home tab. The jump waits a tick: until the tab bar has
 * re-rendered, the home tab is still hidden, and a hidden tab can't take focus.
 */
function enterMode(mode: ActiveMode, then?: () => void) {
  setActiveMode(mode)
  setTimeout(() => {
    router.navigate(modeHome[mode])
    then?.()
  }, 0)
}

/** One side of the mode switch: the selected tile is ink; a mode not yet on says so. */
function ModeTile({
  mode,
  selected,
  enabled,
  loading,
  disabled,
  onPress,
}: {
  mode: ActiveMode
  selected: boolean
  enabled: boolean
  loading: boolean
  disabled: boolean
  onPress: () => void
}) {
  const info = modes[mode]
  const { color } = useTokens()
  return (
    // PressableScale fills its parent's width; this View is what shares the row.
    <View className="flex-1">
      <PressableScale
        haptic="selection"
        accessibilityRole="radio"
        accessibilityState={{ selected, busy: loading, disabled }}
        accessibilityLabel={`${info.title} mode. ${enabled ? info.body : `Not turned on. Tap to turn on ${info.title.toLowerCase()} mode`}`}
        disabled={disabled}
        onPress={onPress}
        className={cn(
          "min-h-36 justify-between gap-4 rounded-xl p-4",
          selected ? "bg-inverse" : "bg-surface border border-border"
        )}
      >
        <View className="flex-row items-center justify-between">
          <View
            className={cn(
              "rounded-pill h-11 w-11 items-center justify-center",
              selected ? "bg-accent" : "bg-surfaceMuted"
            )}
          >
            {loading ? (
              <ActivityIndicator
                color={selected ? color.onAccent : color.text}
              />
            ) : (
              <Icon
                name={info.icon}
                size={20}
                tone={selected ? "onAccent" : "text"}
              />
            )}
          </View>
          {selected ? <Icon name="check" size={18} tone="onInverse" /> : null}
        </View>
        <View className="gap-0.5">
          <Text variant="title-sm" tone={selected ? "onInverse" : "default"}>
            {info.title}
          </Text>
          <Text
            variant="footnote"
            tone={selected ? "onInverse" : "muted"}
            className={selected ? "opacity-80" : undefined}
          >
            {enabled ? info.body : "Tap to turn on"}
          </Text>
        </View>
      </PressableScale>
    </View>
  )
}
