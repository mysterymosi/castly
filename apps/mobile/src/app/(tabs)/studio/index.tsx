import type { StudioState } from "@workspace/schema"
import { router } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { FadeIn } from "react-native-reanimated"

import { authApi } from "@/auth/client"
import { errorMessage, useSession } from "@/auth/session-provider"
import { AnimatedView } from "@/components/ui/animated"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Screen } from "@/components/ui/screen"
import { EmptyState, ErrorState, InlineError, Skeleton } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { markPreviewRequested } from "@/lib/measure"
import { studioApi } from "@/studio/api"
import { CanvasCard } from "@/studio/canvas-card"
import { CompletenessMeter } from "@/studio/completeness-meter"
import { PhotosGrid } from "@/studio/photos-grid"
import { PortfolioSections } from "@/studio/portfolio-sections"
import { PillsField, ProfileSection } from "@/studio/profile-section"
import { useStudio } from "@/studio/studio-provider"
import { queryClient, trpcQuery } from "@/trpc/query-client"

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
      await queryClient.invalidateQueries(trpcQuery.talent.pathFilter())
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

  if (!me?.modes.includes("talent")) return <EnableTalent />

  const { state, loading, loadError, actionError, pending, reload, run } = studio

  if (!state && loadError) {
    return (
      <Screen edges={["top"]}>
        <ErrorState message={loadError} onRetry={reload} />
      </Screen>
    )
  }

  const quickStartDone = !!state?.talent.profile.quickStartCompletedAt

  const categoryNames = (state?.categoryIds ?? []).flatMap((id) => {
    const name = state?.categories.find((c) => c.id === id)?.name
    return name ? [name] : []
  })

  return (
    <Screen scroll edges={["top"]} contentClassName="pt-2">
      <View className="flex-row items-center justify-between pb-2">
        <Text variant="display-sm">Studio</Text>
        {quickStartDone ? (
          <IconButton
            icon="eye"
            accessibilityLabel="Preview portfolio"
            onPress={() => {
              markPreviewRequested()
              router.push("/studio/preview")
            }}
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
                      : state.completeness.publishBlockers[0] === "category"
                        ? "Pick what you do before publishing."
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

          <ProfileSection title="Photos" subtitle="Up to 6. The first one is your Main photo.">
            <PhotosGrid state={state} />
          </ProfileSection>

          <ProfileSection
            title="What you do"
            subtitle={
              categoryNames.length > 0
                ? "You show up for roles in these."
                : "Until you pick, you won't show up for any role."
            }
            warn={categoryNames.length === 0}
          >
            <PillsField
              title="What you do"
              values={categoryNames}
              emptyLabel="Pick what you do"
              onPress={() => router.push("/studio/categories")}
            />
          </ProfileSection>

          <ProfileSection
            title="Highlights"
            subtitle="Up to 3 short facts on your card. Bookers read these before deciding."
          >
            <PillsField
              title="Highlights"
              values={state.talent.profile.cardConfig.highlightFacts.filter((f) => f.trim())}
              emptyLabel="Add your highlights"
              onPress={() => router.push("/studio/highlights")}
            />
          </ProfileSection>

          <ProfileSection title="Canvas" subtitle="A short video or photo behind your name on the deck.">
            <CanvasCard state={state} />
          </ProfileSection>

          <PortfolioSections state={state} />

          <Text variant="footnote" tone="muted" className="mb-28 mt-8">
            Bookers see your portfolio in this order, with your photos in between. Empty sections
            stay hidden until you fill them in.
          </Text>
        </AnimatedView>
      )}
    </Screen>
  )
}
