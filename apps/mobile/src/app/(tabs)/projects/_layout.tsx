import { Stack } from "expo-router"

import { useTokens } from "@/hooks/use-tokens"

export default function ProjectsLayout() {
  const { color } = useTokens()
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[projectId]" />
      <Stack.Screen name="shortlists" />
      <Stack.Screen name="shortlist/[shortlistId]" />
      <Stack.Screen name="compare" />
      <Stack.Screen
        name="note"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: { backgroundColor: color.surface },
        }}
      />
      <Stack.Screen name="new" options={{ presentation: "modal" }} />
      <Stack.Screen name="role" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
    </Stack>
  )
}
