import { matchIdInput } from "@workspace/schema"
import { router, useLocalSearchParams } from "expo-router"

import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { ErrorState } from "@/components/ui/states"
import { ChatThread } from "@/inbox/chat-thread"

export default function ChatRoute() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>()
  const parsed = matchIdInput.safeParse({ matchId })
  if (!parsed.success) {
    return (
      <Screen header={<ScreenHeader title="Chat" onBack={closeChat} />}>
        <ErrorState message="This conversation could not be found." />
      </Screen>
    )
  }
  return (
    <ChatThread
      key={parsed.data.matchId}
      matchId={parsed.data.matchId}
      onBack={closeChat}
    />
  )
}

function closeChat() {
  if (router.canGoBack()) router.back()
  else router.replace("/inbox")
}
