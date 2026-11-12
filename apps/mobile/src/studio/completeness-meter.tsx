import type { StudioState } from "@workspace/schema"
import { router, type Href } from "expo-router"
import { View } from "react-native"

import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Text } from "@/components/ui/text"
import { editorRoute } from "@/studio/section-meta"

type Props = {
  completeness: StudioState["completeness"]
}

/** Where the meter's next step is done; null when it's on the hub itself (showreel, photos). */
function nextStepRoute(key: string): Href | null {
  if (key === "quick_start") return "/studio/quick-start"
  if (key === "category") return "/studio/categories"
  return editorRoute(key)
}

export function CompletenessMeter({ completeness }: Props) {
  const score = Math.round(completeness.score)
  const status = completeness.canPublish
    ? "Ready to publish"
    : completeness.publishBlockers[0] === "category"
      ? "Pick what you do to publish"
      : completeness.quickStartMet
        ? "Quick start done — keep adding detail"
        : "Finish quick start to publish"
  const next = completeness.nextStep
  const nextRoute = next ? nextStepRoute(next.key) : null

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
      {next ? (
        <PressableScale
          accessibilityRole={nextRoute ? "button" : "text"}
          accessibilityLabel={`Next: ${next.label}${next.points > 0 ? `, ${next.points} points` : ""}`}
          disabled={!nextRoute}
          onPress={() => nextRoute && router.push(nextRoute)}
          className="flex-row items-center gap-2 pt-1"
        >
          <Icon name="arrow-right" size={14} tone="accentText" />
          <Text variant="body-sm" tone="accent" className="flex-1">
            Next: {next.label}
          </Text>
          {next.points > 0 ? (
            <Text variant="footnote" tone="muted">
              +{next.points}
            </Text>
          ) : null}
        </PressableScale>
      ) : null}
    </Card>
  )
}
