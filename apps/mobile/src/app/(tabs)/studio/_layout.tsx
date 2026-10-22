import { Stack } from "expo-router"

import { useSession } from "@/auth/session-provider"
import { useTokens } from "@/hooks/use-tokens"
import { UploadQueueProvider } from "@/media/upload-queue-provider"
import { StudioProvider, useStudio } from "@/studio/studio-provider"

function StudioStack() {
  const { color } = useTokens()
  const { reload } = useStudio()
  return (
    <UploadQueueProvider onStudioChanged={reload}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="quick-start" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="highlights" />
        <Stack.Screen
          name="add-section"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: color.surface },
          }}
        />
        <Stack.Screen name="preview" options={{ presentation: "modal" }} />
      </Stack>
    </UploadQueueProvider>
  )
}

export default function StudioLayout() {
  const { me } = useSession()
  const isTalent = !!me?.modes.includes("talent")

  return (
    <StudioProvider enabled={isTalent}>
      <StudioStack />
    </StudioProvider>
  )
}
