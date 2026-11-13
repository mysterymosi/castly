import type { StudioState } from "@workspace/schema"
import { Alert, View } from "react-native"

import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { Text } from "@/components/ui/text"
import { isIntentActive, uploadIntentLabel } from "@/media/upload-intent"
import { useUploadQueue } from "@/media/upload-queue-provider"
import { studioApi } from "@/studio/api"
import { AddField, FieldBox } from "@/studio/profile-section"
import { useStudio } from "@/studio/studio-provider"

export function showreelMediaId(state: StudioState) {
  const config = state.talent.sections.find((s) => s.type === "showreel")?.config as
    | { mediaId?: string | null }
    | undefined
  return config?.mediaId ?? null
}

/** The showreel field: add, replace or remove the one video, with upload progress in place. */
export function ShowreelField({ state }: { state: StudioState }) {
  const { pending, run } = useStudio()
  const { intents, pickAndEnqueueShowreel, retry, dismiss } = useUploadQueue()
  const uploading = intents.find((row) => row.goal === "showreel" && isIntentActive(row))
  const failed = intents.find((row) => row.goal === "showreel" && row.phase === "failed")
  const hasShowreel = Boolean(showreelMediaId(state))

  if (uploading || failed) {
    return (
      <View className="gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <Text variant="body">
          {uploading
            ? uploading.phase === "processing"
              ? "Processing your video…"
              : "Uploading… you can leave the app"
            : (failed?.error ?? "Upload failed")}
        </Text>
        {uploading ? (
          <ProgressBar value={uploading.progress} label={`${uploadIntentLabel(uploading)} upload`} />
        ) : failed ? (
          <View className="flex-row gap-2">
            <Button label="Retry" size="md" className="flex-1" onPress={() => retry(failed.id)} />
            <Button label="Dismiss" size="md" variant="ghost" className="flex-1" onPress={() => dismiss(failed.id)} />
          </View>
        ) : null}
      </View>
    )
  }

  if (!hasShowreel) {
    return <AddField label="Add your showreel" onPress={() => void pickAndEnqueueShowreel()} />
  }

  return (
    <FieldBox
      filled
      accessibilityLabel="Showreel uploaded. Replace or remove it"
      onPress={() =>
        Alert.alert("Your showreel", undefined, [
          { text: "Replace", onPress: () => void pickAndEnqueueShowreel() },
          {
            text: "Remove",
            style: "destructive",
            onPress: () =>
              Alert.alert("Remove your showreel?", "It comes off your portfolio and is deleted.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Remove",
                  style: "destructive",
                  onPress: () =>
                    void run("showreel:remove", () => studioApi.setShowreel(null), "Could not remove the showreel"),
                },
              ]),
          },
          { text: "Cancel", style: "cancel" },
        ])
      }
    >
      <Text variant="body">{pending === "showreel:remove" ? "Removing…" : "Showreel uploaded"}</Text>
    </FieldBox>
  )
}
