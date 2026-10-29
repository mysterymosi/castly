import { router } from "expo-router"
import { useState } from "react"
import { View } from "react-native"

import { authApi } from "@/auth/client"
import { errorMessage, useSession } from "@/auth/session-provider"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon, type IconName } from "@/components/ui/icon"
import { Screen } from "@/components/ui/screen"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { haptics } from "@/lib/haptics"
import { queryClient, trpcQuery } from "@/trpc/query-client"

type Mode = "talent" | "booker"

const modes: Record<Mode, { title: string; body: string; icon: IconName }> = {
  talent: {
    title: "Talent",
    body: "Build a portfolio and decision card that bookers can review.",
    icon: "star",
  },
  booker: {
    title: "Booker",
    body: "Find and shortlist talent for your productions.",
    icon: "briefcase",
  },
}

export default function AccountScreen() {
  const { me, refreshMe, signOut } = useSession()
  const [pending, setPending] = useState<Mode | "signOut" | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!me) return null

  const label = me.email ?? me.phone ?? "Your account"
  const initial = label.trim().charAt(0).toUpperCase() || "C"

  async function enable(mode: Mode) {
    setPending(mode)
    setError(null)
    try {
      await authApi.enableMode(mode)
      await refreshMe()
      await queryClient.invalidateQueries(
        mode === "booker" ? trpcQuery.booker.pathFilter() : trpcQuery.talent.pathFilter(),
      )
      haptics.success()
      // Booker mode is only useful once we know what kind of work they do (PRD §6.2).
      if (mode === "booker") router.push("/booker-setup")
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
          className="h-16 w-16 items-center justify-center rounded-pill bg-accent"
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
            {me.modes.length > 0
              ? `Active as ${me.modes.filter((m) => m !== "admin").join(" and ") || "admin"}`
              : "Choose how you'll use Castly"}
          </Text>
        </View>
      </Card>

      <View className="gap-3">
        <Text variant="caption" tone="muted">
          How you use Castly
        </Text>
        {(Object.keys(modes) as Mode[]).map((mode) => {
          const info = modes[mode]
          const active = me.modes.includes(mode)
          return (
            <Card key={mode} className="gap-4">
              <View className="flex-row items-start gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-pill bg-surfaceMuted">
                  <Icon name={info.icon} size={20} />
                </View>
                <View className="flex-1 gap-1">
                  <View className="flex-row items-center gap-2">
                    <Text variant="body-strong">{info.title}</Text>
                    {active ? (
                      <View className="flex-row items-center gap-1 rounded-pill bg-interested/15 px-2 py-0.5">
                        <Icon name="check" size={12} tone="interestedText" />
                        <Text variant="footnote" tone="interested">
                          Active
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text variant="body-sm" tone="muted">
                    {info.body}
                  </Text>
                </View>
              </View>
              {active ? (
                mode === "talent" ? (
                  <Button
                    label="Open portfolio studio"
                    variant="secondary"
                    size="md"
                    icon="arrow-right"
                    iconPosition="right"
                    onPress={() => router.navigate("/studio")}
                  />
                ) : (
                  <Button
                    label="Booker profile"
                    variant="secondary"
                    size="md"
                    icon="arrow-right"
                    iconPosition="right"
                    onPress={() => router.push("/booker-setup")}
                  />
                )
              ) : (
                <Button
                  label={`Enable ${info.title.toLowerCase()} mode`}
                  variant={mode === "talent" ? "primary" : "inverse"}
                  size="md"
                  loading={pending === mode}
                  disabled={pending !== null}
                  onPress={() => enable(mode)}
                />
              )}
            </Card>
          )
        })}
        {error ? <InlineError message={error} /> : null}
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
