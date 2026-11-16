import { canvasSpec, type StudioState } from "@workspace/schema"
import { Image } from "expo-image"
import { useState } from "react"
import { View } from "react-native"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { ProgressBar } from "@/components/ui/progress-bar"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { isIntentActive } from "@/media/upload-intent"
import { useUploadQueue } from "@/media/upload-queue-provider"
import { studioApi } from "@/studio/api"
import { ToggleRow } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

const SPEC_LINE = `${canvasSpec.minDurationMs / 1000}–${canvasSpec.maxDurationMs / 1000} second vertical video (9:16, MP4 or MOV) or a vertical photo`

/**
 * The deck card's canvas (`canvasSpec`): what plays behind the talent's name, like a Spotify
 * Canvas. Separate from the showreel. Without one, the card shows the photos.
 */
export function CanvasCard({ state }: { state: StudioState }) {
  const { pending, run } = useStudio()
  const { intents, pickAndEnqueueCanvas, retry, dismiss } = useUploadQueue()
  const [problem, setProblem] = useState<string | null>(null)

  const canvasId = state.talent.profile.cardConfig.canvasMediaId
  const media = canvasId ? state.media[canvasId] : undefined
  const thumb = media?.kind === "image" ? media.variants?.thumb : media?.posterUrl
  const uploading = intents.find((row) => row.goal === "canvas" && isIntentActive(row))
  const failed = intents.find((row) => row.goal === "canvas" && row.phase === "failed")
  const removing = pending === "canvas:remove"
  const enabled = state.talent.profile.cardConfig.canvasEnabled

  async function pick() {
    setProblem(null)
    const picked = await pickAndEnqueueCanvas()
    if (picked && "problem" in picked) setProblem(picked.problem)
  }

  const status = uploading
    ? uploading.phase === "processing"
      ? "Processing…"
      : "Uploading… you can leave the app"
    : failed
      ? (failed.error ?? "Upload failed")
      : media
        ? media.status === "ready"
          ? !enabled
            ? "Off: your card shows your photos"
            : media.kind === "video"
              ? "Loops behind your name on the deck"
              : "Shows behind your name on the deck"
          : "Processing…"
        : SPEC_LINE

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-4">
        <View
          className="items-center justify-center overflow-hidden rounded-md bg-surfaceMuted"
          style={{ width: 45, height: 80 }}
        >
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              contentFit="cover"
              style={{ width: 45, height: 80 }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Icon name="sparkle" size={20} tone="textMuted" />
          )}
          {media?.kind === "video" ? (
            <View className="absolute bottom-1 right-1">
              <Icon name="play" size={12} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="body-strong">{canvasId ? "Canvas" : "Add a canvas"}</Text>
          <Text variant="footnote" tone="muted">
            {status}
          </Text>
        </View>
      </View>
      {canvasId ? (
        <ToggleRow
          label="Show on your card"
          hint="Off, bookers see your photos instead. Your canvas stays saved."
          value={enabled}
          onChange={(canvasEnabled) =>
            void run(
              "canvas:enabled",
              () => studioApi.updateProfile({ cardConfig: { canvasEnabled } }),
              "Could not change your card"
            )
          }
        />
      ) : null}
      {uploading ? (
        <ProgressBar value={uploading.progress} label="Canvas upload" />
      ) : null}
      {problem ? <InlineError message={problem} /> : null}
      <View className="flex-row gap-2">
        {/* The button's pressable wrapper is full width; the View takes the row's share. */}
        <View className="flex-1">
          <Button
            label={uploading ? "Uploading" : failed ? "Retry" : canvasId ? "Replace" : "Upload"}
            size="md"
            variant="inverse"
            loading={!!uploading}
            disabled={!!uploading || removing}
            onPress={() => {
              if (failed) retry(failed.id)
              else void pick()
            }}
          />
        </View>
        {failed ? (
          <Button label="Dismiss" variant="ghost" size="md" onPress={() => dismiss(failed.id)} />
        ) : canvasId && !uploading ? (
          <Button
            label="Remove"
            variant="secondary"
            size="md"
            loading={removing}
            onPress={() =>
              void run("canvas:remove", () => studioApi.setCanvas(null), "Could not remove the canvas")
            }
          />
        ) : null}
      </View>
    </Card>
  )
}
