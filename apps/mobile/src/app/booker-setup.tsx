import { useMutation, useQuery } from "@tanstack/react-query"
import {
  bookerProfileStateSchema,
  bookerVerticalLabels,
  bookerVerticals,
  projectTypeLabels,
  projectTypes,
  type BookerProfileState,
  type BookerVertical,
  type ProjectType,
} from "@workspace/schema"
import { router } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { FadeInRight, FadeOutLeft } from "react-native-reanimated"

import { errorMessage } from "@/auth/session-provider"
import { AnimatedView } from "@/components/ui/animated"
import { Chip } from "@/components/ui/chip"
import { NextBar } from "@/components/ui/next-bar"
import { ProgressBar } from "@/components/ui/progress-bar"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { ErrorState, InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { haptics } from "@/lib/haptics"
import { queryClient, trpcQuery } from "@/trpc/query-client"

const steps = ["vertical", "company", "city", "projects"] as const
type Step = (typeof steps)[number]

const COMPANY_MAX = 120

function StepTitle({ title, body }: { title: string; body: string }) {
  return (
    <View className="gap-2">
      <Text variant="display-sm">{title}</Text>
      <Text variant="body" tone="muted">
        {body}
      </Text>
    </View>
  )
}

/** PRD §6.2 booker profiling: what you do, company, location, typical project types. */
export default function BookerSetupScreen() {
  const profileQuery = useQuery(
    trpcQuery.booker.getProfile.queryOptions(undefined, { select: bookerProfileStateSchema.parse }),
  )

  if (profileQuery.data) return <BookerSetupForm state={profileQuery.data} />
  if (profileQuery.error) {
    return (
      <Screen edges={["top", "bottom"]} contentClassName="justify-center">
        <ErrorState
          message={errorMessage(profileQuery.error, "Could not load your booker profile")}
          onRetry={() => void profileQuery.refetch()}
        />
      </Screen>
    )
  }
  return <LoadingState />
}

/**
 * Fields start from the saved profile once, at mount: a background refetch of the profile never
 * overwrites what the booker is typing.
 */
function BookerSetupForm({ state }: { state: BookerProfileState }) {
  const saved = state.profile
  const [stepIndex, setStepIndex] = useState(0)
  const [vertical, setVertical] = useState<BookerVertical | null>(saved?.vertical ?? null)
  const [companyName, setCompanyName] = useState(saved?.companyName ?? "")
  const [cityId, setCityId] = useState(saved?.cityId ?? "")
  const [types, setTypes] = useState<ProjectType[]>(saved?.typicalProjectTypes ?? [])
  const [error, setError] = useState<string | null>(null)
  const updateProfile = useMutation(
    trpcQuery.booker.updateProfile.mutationOptions({
      // The response is the new profile state: write it into the cache instead of refetching.
      onSuccess: (data) => queryClient.setQueryData(trpcQuery.booker.getProfile.queryKey(), data),
    }),
  )
  const pending = updateProfile.isPending

  const step: Step = steps[stepIndex]!
  const editing = state.profile !== null
  const canContinue: Record<Step, boolean> = {
    vertical: vertical !== null,
    company: true,
    city: cityId.length > 0,
    projects: types.length > 0,
  }

  function back() {
    setError(null)
    if (stepIndex === 0) router.back()
    else setStepIndex((i) => i - 1)
  }

  function next() {
    if (!canContinue[step]) return
    setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  }

  function toggleType(type: ProjectType) {
    setTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    )
  }

  async function save() {
    if (!vertical || !canContinue.projects) return
    setError(null)
    try {
      await updateProfile.mutateAsync({
        vertical,
        companyName: companyName.trim() || null,
        cityId,
        // Keep the on-screen order rather than tap order.
        typicalProjectTypes: projectTypes.filter((t) => types.includes(t)),
      })
      haptics.success()
      router.back()
    } catch (caught) {
      haptics.error()
      setError(errorMessage(caught, "Could not save your booker profile"))
    }
  }

  const last = step === "projects"

  return (
    <Screen
      scroll
      header={
        <View className="gap-2 pb-2">
          <ScreenHeader
            onBack={back}
            backIcon={stepIndex === 0 ? "close" : "chevron-left"}
            backLabel={stepIndex === 0 ? "Close booker setup" : "Previous step"}
            right={
              <Text variant="footnote" tone="muted">
                {stepIndex + 1}/{steps.length}
              </Text>
            }
          />
          <ProgressBar
            value={(stepIndex + 1) / steps.length}
            label={`Booker setup step ${stepIndex + 1} of ${steps.length}`}
            className="mx-5"
          />
        </View>
      }
      footer={
        <View className="gap-3 pb-1">
          {error ? <InlineError message={error} /> : null}
          <NextBar
            onNext={last ? save : next}
            disabled={!canContinue[step]}
            loading={pending}
            label={last ? (editing ? "Save changes" : "Finish setup") : "Continue"}
            note={
              step === "company"
                ? "Optional"
                : step === "projects" && types.length > 0
                  ? `${types.length} selected`
                  : undefined
            }
            noteIcon={step === "company" ? "briefcase" : "check"}
          />
        </View>
      }
      contentClassName="pt-4"
    >
      <AnimatedView
        key={step}
        entering={FadeInRight.duration(220)}
        exiting={FadeOutLeft.duration(160)}
        className="gap-6"
      >
        {step === "vertical" ? (
          <>
            <StepTitle
              title="What kind of work do you do?"
              body="We use this to decide which talent you see first. You can change it later."
            />
            <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
              {bookerVerticals.map((value) => (
                <Chip
                  key={value}
                  label={bookerVerticalLabels[value]}
                  selected={vertical === value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: vertical === value }}
                  onPress={() => setVertical(value)}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === "company" ? (
          <>
            <StepTitle
              title="Who do you work with?"
              body="Your company, agency or production house. Leave it blank if you work independently."
            />
            <TextField
              label="Company (optional)"
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="e.g. Lagoon Pictures"
              autoComplete="organization"
              textContentType="organizationName"
              autoFocus
              maxLength={COMPANY_MAX}
              returnKeyType="next"
              onSubmitEditing={next}
            />
          </>
        ) : null}

        {step === "city" ? (
          <>
            <StepTitle title="Where are you based?" body="Talent near where you shoot comes first." />
            <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
              {state.cities.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  icon="location"
                  selected={cityId === c.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: cityId === c.id }}
                  onPress={() => setCityId(c.id)}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === "projects" ? (
          <>
            <StepTitle
              title="What do you usually cast for?"
              body="Pick all that apply. Tap again to remove one."
            />
            <View className="flex-row flex-wrap gap-2">
              {projectTypes.map((type) => (
                <Chip
                  key={type}
                  label={projectTypeLabels[type]}
                  selected={types.includes(type)}
                  onPress={() => toggleType(type)}
                />
              ))}
            </View>
          </>
        ) : null}
      </AnimatedView>
    </Screen>
  )
}
