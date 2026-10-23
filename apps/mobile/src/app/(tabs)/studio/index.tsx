import type { StudioState } from "@workspace/schema"
import { router } from "expo-router"
import { useState } from "react"
import { ActivityIndicator, ScrollView, View } from "react-native"
import { FadeIn, LinearTransition } from "react-native-reanimated"

import { authApi } from "@/auth/client"
import { errorMessage, useSession } from "@/auth/session-provider"
import { AnimatedView } from "@/components/ui/animated"
import { Button } from "@/components/ui/button"
import { Card, PressableCard } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Screen } from "@/components/ui/screen"
import { EmptyState, ErrorState, InlineError, Skeleton } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { cn } from "@/lib/cn"
import { isIntentActive, uploadIntentLabel } from "@/media/upload-intent"
import { useUploadQueue } from "@/media/upload-queue-provider"
import { ProgressBar } from "@/components/ui/progress-bar"
import { studioApi } from "@/studio/api"
import { CompletenessMeter } from "@/studio/completeness-meter"
import { DecisionCardPreview } from "@/studio/decision-card-preview"
import { sectionMeta, templates } from "@/studio/section-meta"
import { useStudio } from "@/studio/studio-provider"

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View className="mb-3 mt-8 flex-row items-center justify-between">
      <Text variant="title-sm">{title}</Text>
      {action}
    </View>
  )
}

function HubSkeleton() {
  return (
    <View className="gap-4 pt-4" accessibilityLabel="Loading studio">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </View>
  )
}

function EnableTalent() {
  const { refreshMe } = useSession()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enable() {
    setPending(true)
    setError(null)
    try {
      await authApi.enableMode("talent")
      await refreshMe()
    } catch (caught) {
      setError(errorMessage(caught, "Could not enable talent mode"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen edges={["top"]} contentClassName="justify-center">
      <EmptyState
        icon="star"
        title="Turn on talent mode"
        body="The studio is where talent builds the portfolio and decision card bookers see."
      />
      <Button label="Enable talent mode" loading={pending} onPress={enable} className="mx-6" />
      {error ? <InlineError message={error} className="mx-6 mt-4" /> : null}
    </Screen>
  )
}

function QuickStartPrompt({ state }: { state: StudioState }) {
  return (
    <AnimatedView entering={FadeIn.duration(220)} className="gap-4">
      <View className="gap-5 rounded-xl bg-inverse p-6">
        <View className="h-12 w-12 items-center justify-center rounded-pill bg-accent">
          <Icon name="sparkle" size={22} tone="onAccent" />
        </View>
        <View className="gap-2">
          <Text variant="title" tone="onInverse">
            Set up your portfolio
          </Text>
          <Text variant="body-sm" tone="onInverse" className="opacity-80">
            Five short steps: your name, city, a one-line bio, your top skills and three photos.
          </Text>
        </View>
        <Button
          label="Start quick start"
          icon="arrow-right"
          iconPosition="right"
          onPress={() => router.push("/studio/quick-start")}
        />
      </View>
      <CompletenessMeter completeness={state.completeness} />
    </AnimatedView>
  )
}

export default function StudioHub() {
  const { me } = useSession()
  const studio = useStudio()
  const { color } = useTokens()
  const { intents, pickAndEnqueueShowreel, retry, dismiss } = useUploadQueue()

  if (!me?.modes.includes("talent")) return <EnableTalent />

  const { state, loading, loadError, actionError, pending, reload, run } = studio
  const showreelUpload = intents.find((row) => row.goal === "showreel" && isIntentActive(row))
  const failedShowreel = intents.find((row) => row.goal === "showreel" && row.phase === "failed")

  if (!state && loadError) {
    return (
      <Screen edges={["top"]}>
        <ErrorState message={loadError} onRetry={reload} />
      </Screen>
    )
  }

  const quickStartDone = !!state?.talent.profile.quickStartCompletedAt
  const ordered = state ? [...state.talent.sections].sort((a, b) => a.position - b.position) : []

  function move(sectionId: string, direction: -1 | 1) {
    const index = ordered.findIndex((s) => s.id === sectionId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ordered.length) return
    const next = [...ordered]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    void run(`move:${sectionId}`, () => studioApi.reorderSections(next.map((s) => s.id)), "Could not reorder")
  }

  function startShowreelUpload() {
    void pickAndEnqueueShowreel()
  }

  const hasShowreel = ordered.some((s) => s.type === "showreel")
  const showreelBusy = !!showreelUpload

  return (
    <Screen scroll edges={["top"]} contentClassName="pt-2">
      <View className="flex-row items-center justify-between pb-2">
        <Text variant="display-sm">Studio</Text>
        {quickStartDone ? (
          <IconButton
            icon="eye"
            accessibilityLabel="Preview portfolio"
            onPress={() => router.push("/studio/preview")}
          />
        ) : null}
      </View>

      {!state || (loading && !state) ? (
        <HubSkeleton />
      ) : !quickStartDone ? (
        <QuickStartPrompt state={state} />
      ) : (
        <AnimatedView entering={FadeIn.duration(220)}>
          {actionError ? <InlineError message={actionError} className="mb-4" /> : null}

          <CompletenessMeter completeness={state.completeness} />

          <Card className="mt-4 gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 gap-0.5">
                <Text variant="body-strong">
                  {state.talent.profile.status === "live"
                    ? "Portfolio is live"
                    : state.talent.profile.status === "suspended"
                      ? "Portfolio is suspended"
                      : "Portfolio is a draft"}
                </Text>
                <Text variant="footnote" tone="muted">
                  {state.talent.profile.status === "suspended"
                    ? "Publishing is turned off until this is lifted."
                    : state.completeness.canPublish
                      ? "Bookers can find you once this is published."
                      : "Finish quick start before publishing."}
                </Text>
              </View>
            </View>
            {state.talent.profile.status === "live" ? (
              <Button
                label="Unpublish"
                variant="secondary"
                size="md"
                loading={pending === "unpublish"}
                disabled={pending !== null}
                onPress={() =>
                  void run("unpublish", () => studioApi.unpublish(), "Could not unpublish")
                }
              />
            ) : (
              <Button
                label="Publish"
                size="md"
                loading={pending === "publish"}
                disabled={pending !== null || !state.completeness.canPublish || state.talent.profile.status === "suspended"}
                onPress={() =>
                  void run("publish", () => studioApi.publish(), "Could not publish")
                }
              />
            )}
          </Card>

          <SectionHeading title="Decision card" />
          <PressableCard
            accessibilityLabel="Decision card. Opens a preview"
            onPress={() => router.push({ pathname: "/studio/preview", params: { tab: "card" } })}
            className="flex-row items-center gap-4 p-3"
          >
            <View className="overflow-hidden rounded-lg" style={{ width: 96, height: 128 }} pointerEvents="none">
              <DecisionCardPreview
                displayName={state.talent.profile.displayName}
                headline={state.talent.profile.headline}
                cardConfig={state.talent.profile.cardConfig}
                compact
              />
            </View>
            <View className="flex-1 gap-1">
              <Text variant="body-strong">What bookers see first</Text>
              <Text variant="body-sm" tone="muted">
                {state.talent.profile.cardConfig.highlightFacts.filter(Boolean).length}/3 highlights added
              </Text>
            </View>
            <Icon name="chevron-right" size={18} tone="textMuted" />
          </PressableCard>
          <Button
            label="Edit highlights"
            variant="secondary"
            size="md"
            onPress={() => router.push("/studio/highlights")}
            className="mt-3"
          />

          <SectionHeading title="Template" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5"
            contentContainerClassName="gap-3 px-5"
          >
            {templates.map((template) => {
              const busy = pending === `template:${template.id}`
              return (
                <PressableCard
                  key={template.id}
                  accessibilityLabel={`Apply ${template.label} template. ${template.description}`}
                  accessibilityState={{ busy, disabled: pending !== null }}
                  disabled={pending !== null}
                  onPress={() =>
                    void run(`template:${template.id}`, () => studioApi.applyTemplate(template.id), "Could not apply template")
                  }
                  className="gap-3 p-4"
                  style={{ width: 168 }}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-pill bg-surfaceMuted">
                    {busy ? <ActivityIndicator color={color.text} /> : <Icon name={template.icon} size={18} />}
                  </View>
                  <View className="gap-0.5">
                    <Text variant="body-strong">{template.label}</Text>
                    <Text variant="footnote" tone="muted">
                      {template.description}
                    </Text>
                  </View>
                </PressableCard>
              )
            })}
          </ScrollView>

          <SectionHeading
            title="Sections"
            action={
              <Text variant="footnote" tone="muted">
                {ordered.length} total
              </Text>
            }
          />
          <View className="gap-2">
            {ordered.map((section, index) => {
              const meta = sectionMeta[section.type]
              const busy = pending === `move:${section.id}`
              return (
                <AnimatedView
                  key={section.id}
                  layout={LinearTransition.duration(220)}
                  className="min-h-16 flex-row items-center gap-3 rounded-xl border border-border bg-surface py-2 pl-4 pr-2"
                >
                  <Icon name={meta.icon} size={18} tone="textMuted" />
                  <View className="flex-1 gap-0.5">
                    <Text variant="body-strong" numberOfLines={1}>
                      {meta.label}
                    </Text>
                    <View
                      className={cn(
                        "flex-row items-center gap-1 self-start rounded-pill px-2 py-0.5",
                        section.isVisible ? "bg-interested/15" : "bg-surfaceMuted",
                      )}
                    >
                      <Icon
                        name={section.isVisible ? "eye" : "eye-off"}
                        size={11}
                        tone={section.isVisible ? "interestedText" : "textMuted"}
                      />
                      <Text variant="footnote" tone={section.isVisible ? "interested" : "muted"}>
                        {section.isVisible ? "Visible" : "Hidden"}
                      </Text>
                    </View>
                  </View>
                  {busy ? <ActivityIndicator color={color.text} className="mr-3" /> : null}
                  <IconButton
                    icon="chevron-up"
                    variant="ghost"
                    accessibilityLabel={`Move ${meta.label} up`}
                    disabled={index === 0 || pending !== null}
                    onPress={() => move(section.id, -1)}
                  />
                  <IconButton
                    icon="chevron-down"
                    variant="ghost"
                    accessibilityLabel={`Move ${meta.label} down`}
                    disabled={index === ordered.length - 1 || pending !== null}
                    onPress={() => move(section.id, 1)}
                  />
                </AnimatedView>
              )
            })}
            {ordered.length === 0 ? (
              <EmptyState icon="layers" title="No sections yet" body="Add sections or apply a template to build your page." />
            ) : null}
          </View>
          <Button
            label="Add section"
            icon="plus"
            variant="secondary"
            size="md"
            onPress={() => router.push("/studio/add-section")}
            className="mt-3"
          />

          <SectionHeading title="Showreel" />
          <Card className="gap-3">
            <View className="flex-row items-center gap-4">
              <View className="h-12 w-12 items-center justify-center rounded-pill bg-surfaceMuted">
                <Icon name="video" size={22} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="body-strong">{hasShowreel ? "Replace showreel" : "Upload a showreel"}</Text>
                <Text variant="footnote" tone="muted">
                  {showreelBusy
                    ? showreelUpload?.phase === "processing"
                      ? "Processing video…"
                      : "Uploading… you can leave the app"
                    : failedShowreel
                      ? (failedShowreel.error ?? "Upload failed")
                      : "Pick a video from your library"}
                </Text>
              </View>
              <Button
                label={showreelBusy ? "Uploading" : failedShowreel ? "Retry" : "Upload"}
                size="md"
                variant="inverse"
                loading={showreelBusy}
                disabled={showreelBusy}
                onPress={() => {
                  if (failedShowreel) retry(failedShowreel.id)
                  else startShowreelUpload()
                }}
              />
            </View>
            {showreelUpload ? (
              <ProgressBar
                value={showreelUpload.progress}
                label={`${uploadIntentLabel(showreelUpload)} upload`}
              />
            ) : null}
            {failedShowreel ? (
              <Button
                label="Dismiss"
                variant="ghost"
                size="md"
                onPress={() => dismiss(failedShowreel.id)}
              />
            ) : null}
          </Card>

          {__DEV__ ? (
            <>
              <SectionHeading title="Developer" />
              <Card className="gap-3 border-dashed">
                <View className="flex-row items-center gap-2">
                  <Icon name="code" size={16} tone="textMuted" />
                  <Text variant="footnote" tone="muted" className="flex-1">
                    Dev-only check: sensitive attributes must not change completeness.
                  </Text>
                </View>
                <Button
                  label="Set test ethnicity attribute"
                  variant="ghost"
                  size="md"
                  loading={pending === "ethnicity"}
                  onPress={() =>
                    void run("ethnicity", () => studioApi.setAttribute("ethnicity", "black"), "Could not set attribute")
                  }
                />
              </Card>
            </>
          ) : null}
        </AnimatedView>
      )}
    </Screen>
  )
}
