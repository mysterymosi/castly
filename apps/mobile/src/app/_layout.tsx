import "@/observability/sentry-init"

import { QueryClientProvider } from "@tanstack/react-query"
import { useFonts } from "expo-font"
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { useEffect, useMemo } from "react"

import "../global.css"

import { SessionProvider, useSession } from "@/auth/session-provider"
import { useTokens } from "@/hooks/use-tokens"
import { appFonts } from "@/theme/fonts"
import { queryClient } from "@/trpc/query-client"
import { motion } from "@workspace/ui-tokens"

void SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({ fade: true, duration: motion.slow })

function RootNavigator() {
  const { status } = useSession()
  const { scheme, color } = useTokens()
  const [fontsLoaded, fontError] = useFonts(appFonts)
  const ready = (fontsLoaded || !!fontError) && status !== "loading"

  useEffect(() => {
    if (fontError) console.error(fontError)
  }, [fontError])

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  const navigationTheme = useMemo(() => {
    const base = scheme === "dark" ? DarkTheme : DefaultTheme
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: color.accentText,
        background: color.bg,
        card: color.surface,
        text: color.text,
        border: color.border,
      },
    }
  }, [scheme, color])

  if (!ready) return null

  const signedIn = status === "signedIn"

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="booker-setup"
            options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  )
}

export default function RootLayout() {
  // Outside the session so sign-out can clear the cache.
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </QueryClientProvider>
  )
}
