import { Stack } from "expo-router"

import { useTokens } from "@/hooks/use-tokens"

export default function AuthLayout() {
  const { color } = useTokens()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: color.bg },
      }}
    />
  )
}
