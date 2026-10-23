import { router } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { FadeInRight, FadeOutLeft } from "react-native-reanimated"

import { errorMessage } from "@/auth/session-provider"
import { AnimatedView } from "@/components/ui/animated"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { Icon } from "@/components/ui/icon"
import { NextBar } from "@/components/ui/next-bar"
import { ProgressBar } from "@/components/ui/progress-bar"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { haptics } from "@/lib/haptics"
import { mediaApi } from "@/media/api"
import { studioApi } from "@/studio/api"
import { useStudio } from "@/studio/studio-provider"

const steps = ["name", "city", "bio", "skills", "photos"] as const
type Step = (typeof steps)[number]

const BIO_MAX = 280
const SKILL_COUNT = 3
const PHOTO_COUNT = 3

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

export default function QuickStartScreen() {
  const { state, setState } = useStudio()
  const [stepIndex, setStepIndex] = useState(0)
  const [displayName, setDisplayName] = useState(
    state && state.talent.profile.displayName !== "New talent" ? state.talent.profile.displayName : "",
  )
  const [cityId, setCityId] = useState(state?.talent.profile.cityId ?? "")
  const [bio, setBio] = useState(state?.talent.profile.bio ?? "")
  const [skillIds, setSkillIds] = useState<string[]>(state?.talent.skillIds.slice(0, SKILL_COUNT) ?? [])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!state) return <LoadingState />

  const step: Step = steps[stepIndex]!
  const canContinue: Record<Step, boolean> = {
    name: displayName.trim().length > 0,
    city: cityId.length > 0,
    bio: bio.trim().length > 0,
    skills: skillIds.length >= SKILL_COUNT,
    photos: true,
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

  function toggleSkill(id: string) {
    setSkillIds((current) => {
      if (current.includes(id)) return current.filter((s) => s !== id)
      if (current.length >= SKILL_COUNT) {
        haptics.error()
        return current
      }
      return [...current, id]
    })
  }

  async function finish() {
    setPending(true)
    setError(null)
    try {
      const photoMediaIds = await mediaApi.uploadQuickStartPhotos(PHOTO_COUNT)
      const next = await studioApi.completeQuickStart({
        displayName: displayName.trim(),
        cityId,
        bio: bio.trim(),
        skillIds,
        photoMediaIds,
      })
      haptics.success()
      setState(next)
      router.back()
    } catch (caught) {
      haptics.error()
      setError(errorMessage(caught, "Could not save quick start"))
    } finally {
      setPending(false)
    }
  }

  const city = state.cities.find((c) => c.id === cityId)

  return (
    <Screen
      scroll
      header={
        <View className="gap-2 pb-2">
          <ScreenHeader
            onBack={back}
            backIcon={stepIndex === 0 ? "close" : "chevron-left"}
            backLabel={stepIndex === 0 ? "Close quick start" : "Previous step"}
            right={
              <Text variant="footnote" tone="muted">
                {stepIndex + 1}/{steps.length}
              </Text>
            }
          />
          <ProgressBar
            value={(stepIndex + 1) / steps.length}
            label={`Quick start step ${stepIndex + 1} of ${steps.length}`}
            className="mx-5"
          />
        </View>
      }
      footer={
        step === "photos" ? (
          <View className="gap-3 pb-1">
            <Button
              label={pending ? "Uploading photos" : `Choose ${PHOTO_COUNT} photos and finish`}
              icon="photo"
              loading={pending}
              onPress={finish}
            />
          </View>
        ) : (
          <NextBar
            onNext={next}
            disabled={!canContinue[step]}
            note={step === "skills" ? `${skillIds.length} of ${SKILL_COUNT} selected` : undefined}
            noteIcon="check"
          />
        )
      }
      contentClassName="pt-4"
    >
      <AnimatedView key={step} entering={FadeInRight.duration(220)} exiting={FadeOutLeft.duration(160)} className="gap-6">
        {step === "name" ? (
          <>
            <StepTitle title="What should bookers call you?" body="Use your professional or stage name." />
            <TextField
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Adaeze Okafor"
              autoComplete="name"
              textContentType="name"
              autoFocus
              maxLength={120}
              returnKeyType="next"
              onSubmitEditing={next}
            />
          </>
        ) : null}

        {step === "city" ? (
          <>
            <StepTitle title="Where are you based?" body="Bookers often cast close to where they shoot." />
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

        {step === "bio" ? (
          <>
            <StepTitle title="Introduce yourself" body="One or two lines bookers will read first. You can add more later." />
            <TextField
              label="Short bio"
              value={bio}
              onChangeText={setBio}
              placeholder="Lagos-based actor with stage and screen credits…"
              multiline
              autoFocus
              maxLength={BIO_MAX}
              hint={`${bio.length}/${BIO_MAX}`}
            />
          </>
        ) : null}

        {step === "skills" ? (
          <>
            <StepTitle title="Pick your top 3 skills" body="These help bookers find you. Tap a skill again to remove it." />
            <View className="flex-row flex-wrap gap-2">
              {state.skills.map((skill) => {
                const selected = skillIds.includes(skill.id)
                return (
                  <Chip
                    key={skill.id}
                    label={skill.name}
                    selected={selected}
                    disabled={!selected && skillIds.length >= SKILL_COUNT}
                    onPress={() => toggleSkill(skill.id)}
                  />
                )
              })}
            </View>
          </>
        ) : null}

        {step === "photos" ? (
          <>
            <StepTitle
              title="Add 3 photos"
              body="Choose three clear photos from your library. Headshots work best. They start your gallery."
            />
            <View className="gap-3 rounded-xl border border-border bg-surface p-5">
              <Text variant="caption" tone="muted">
                Your quick start
              </Text>
              {[
                { icon: "person" as const, label: displayName.trim() },
                { icon: "location" as const, label: city?.name ?? "" },
                { icon: "text" as const, label: bio.trim() },
                {
                  icon: "sparkle" as const,
                  label: state.skills
                    .filter((s) => skillIds.includes(s.id))
                    .map((s) => s.name)
                    .join(", "),
                },
              ].map((row) => (
                <View key={row.icon} className="flex-row items-start gap-3">
                  <Icon name={row.icon} size={16} tone="textMuted" />
                  <Text variant="body-sm" className="flex-1" numberOfLines={2}>
                    {row.label}
                  </Text>
                </View>
              ))}
            </View>
            {pending ? (
              <Text variant="footnote" tone="muted" accessibilityLiveRegion="polite">
                Uploading and processing your photos. This can take a minute on slower connections.
              </Text>
            ) : null}
            {error ? <InlineError message={error} /> : null}
          </>
        ) : null}
      </AnimatedView>
    </Screen>
  )
}
