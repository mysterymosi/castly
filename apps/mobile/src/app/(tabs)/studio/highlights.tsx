import { useState } from "react"
import { View } from "react-native"

import { LoadingState } from "@/components/ui/states"
import { TextField } from "@/components/ui/text-field"
import { studioApi } from "@/studio/api"
import { DecisionCardPreview, mainPhotoUri } from "@/studio/decision-card-preview"
import { EditorScreen, isDirty } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

const MAX_LENGTH = 80
const examples = ["Lead in a Netflix Naija series", "Fluent Yorùbá and Pidgin", "Trained at Royal Arts Academy"]

function threeFacts(saved: string[] | undefined) {
  const facts = [...(saved ?? [])]
  while (facts.length < 3) facts.push("")
  return facts.slice(0, 3)
}

/** Three facts on the decision card, previewed live and saved together with the button. */
export default function HighlightsScreen() {
  const { state, run } = useStudio()
  const saved = threeFacts(state?.talent.profile.cardConfig.highlightFacts)
  const [facts, setFacts] = useState<string[]>(saved)

  if (!state) return <LoadingState />

  return (
    <EditorScreen
      title="Highlights"
      intro="Three short facts shown on your decision card. Bookers read these before deciding."
      save={{
        dirty: isDirty(facts, saved),
        onSave: () =>
          run(
            "highlights",
            () => studioApi.updateProfile({ cardConfig: { highlightFacts: facts.map((f) => f.trim()) } }),
            "Could not save your highlights"
          ),
      }}
    >
      <DecisionCardPreview
        displayName={state.talent.profile.displayName}
        headline={state.talent.profile.headline}
        cardConfig={{ ...state.talent.profile.cardConfig, highlightFacts: facts }}
        mainUri={mainPhotoUri(state)}
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
          />
        ))}
      </View>
    </EditorScreen>
  )
}
