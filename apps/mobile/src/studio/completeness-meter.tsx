import type { StudioState } from "@workspace/schema"
import { View } from "react-native"

import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { ProgressBar } from "@/components/ui/progress-bar"
import { Text } from "@/components/ui/text"

type Props = {
  completeness: StudioState["completeness"]
}

export function CompletenessMeter({ completeness }: Props) {
  const score = Math.round(completeness.score)
  const status = completeness.canPublish
    ? "Ready to publish"
    : completeness.quickStartMet
      ? "Quick start done — keep adding detail"
      : "Finish quick start to publish"

  return (
    <Card className="gap-3">
      <View className="flex-row items-end justify-between">
        <View className="gap-1">
          <Text variant="caption" tone="muted">
            Profile strength
          </Text>
          <Text variant="display-sm" accessibilityRole="text" accessibilityLabel={`Profile ${score} percent complete`}>
            {score}%
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5 pb-1.5">
          <Icon
            name={completeness.canPublish ? "verified" : "sparkle"}
            size={16}
            tone={completeness.canPublish ? "interestedText" : "accentText"}
          />
          <Text variant="footnote" tone={completeness.canPublish ? "interested" : "muted"}>
            {status}
          </Text>
        </View>
      </View>
      <ProgressBar value={score / 100} label="Profile strength" />
    </Card>
  )
}
