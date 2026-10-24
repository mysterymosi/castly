import { router } from "expo-router"
import { useState } from "react"
import { View } from "react-native"

import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { studioApi } from "@/studio/api"
import { DecisionCardPreview } from "@/studio/decision-card-preview"
import { useStudio } from "@/studio/studio-provider"

const MAX_LENGTH = 80
const examples = ["Lead in a Netflix Naija series", "Fluent Yorùbá and Pidgin", "Trained at Royal Arts Academy"]

export default function HighlightsScreen() {
  const { state, run, pending, actionError } = useStudio()
  const [facts, setFacts] = useState<string[]>(() => {
    const initial = [...(state?.talent.profile.cardConfig.highlightFacts ?? [])]
    while (initial.length < 3) initial.push("")
    return initial.slice(0, 3)
  })

  if (!state) return <LoadingState />

  function save(index: number, value: string) {
    const saved = state!.talent.profile.cardConfig.highlightFacts[index] ?? ""
    if (value === saved) return
    const next = [...facts]
    next[index] = value
    void run(
      "highlights",
      () => studioApi.updateProfile({ cardConfig: { highlightFacts: next.slice(0, 3) } }),
      "Could not save card",
    )
  }

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="Highlights"
          onBack={() => router.back()}
          right={
            pending === "highlights" ? (
              <Text variant="footnote" tone="muted">
                Saving…
              </Text>
            ) : null
          }
        />
      }
      contentClassName="gap-6 pt-2"
    >
      <View className="gap-1">
        <Text variant="body" tone="muted">
          Three short facts shown on your decision card. Bookers read these before deciding.
        </Text>
      </View>

      <DecisionCardPreview
        displayName={state.talent.profile.displayName}
        headline={state.talent.profile.headline}
        cardConfig={{ ...state.talent.profile.cardConfig, highlightFacts: facts }}
      />

      <View className="gap-4">
        {facts.map((fact, index) => (
          <TextField
            key={index}
            label={`Highlight ${index + 1}`}
            value={fact}
            maxLength={MAX_LENGTH}
            placeholder={examples[index]}
            hint={`${fact.length}/${MAX_LENGTH}`}
            returnKeyType="done"
            onChangeText={(value) =>
              setFacts((current) => current.map((item, i) => (i === index ? value : item)))
            }
            onBlur={() => save(index, fact)}
          />
        ))}
        {actionError ? <InlineError message={actionError} /> : null}
      </View>
    </Screen>
  )
}
