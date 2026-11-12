import type { StudioState } from "@workspace/schema"
import { useState } from "react"
import { View } from "react-native"

import { Chip } from "@/components/ui/chip"
import { Text } from "@/components/ui/text"
import { studioApi } from "@/studio/api"
import { EditorScreen, FieldGroup, humanize, useAutosave } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

type Fluency = StudioState["editor"]["languages"][number]["fluency"]
const fluencies: Fluency[] = ["basic", "conversational", "fluent", "native"]

/** Languages with fluency, and accents (2b.4). Both lists replace the stored ones on save. */
export function LanguagesEditor({ state }: { state: StudioState }) {
  const { run } = useStudio()
  const [languages, setLanguages] = useState(() => state.editor.languages)
  const [accentIds, setAccentIds] = useState(() => state.editor.accentIds)

  useAutosave(languages, (next) =>
    run("languages", () => studioApi.setLanguages(next), "Could not save your languages")
  )
  useAutosave(accentIds, (next) =>
    run("accents", () => studioApi.setAccents(next), "Could not save your accents")
  )

  const name = (id: string) => state.editor.languageOptions.find((l) => l.id === id)?.name ?? "Language"

  return (
    <EditorScreen title="Languages" intro="Languages you can work in, and accents you can do on cue.">
      <FieldGroup title="Languages">
        <View className="flex-row flex-wrap gap-2">
          {state.editor.languageOptions.map((language) => {
            const selected = languages.some((l) => l.languageId === language.id)
            return (
              <Chip
                key={language.id}
                label={language.name}
                selected={selected}
                onPress={() =>
                  setLanguages((current) =>
                    selected
                      ? current.filter((l) => l.languageId !== language.id)
                      : [...current, { languageId: language.id, fluency: "conversational" }]
                  )
                }
              />
            )
          })}
        </View>
      </FieldGroup>

      {languages.map((language) => (
        <View key={language.languageId} className="gap-2">
          <Text variant="body-strong">{name(language.languageId)}</Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {fluencies.map((fluency) => (
              <Chip
                key={fluency}
                label={humanize(fluency)}
                accessibilityRole="radio"
                accessibilityLabel={`${name(language.languageId)}: ${humanize(fluency)}`}
                accessibilityState={{ selected: language.fluency === fluency }}
                selected={language.fluency === fluency}
                onPress={() =>
                  setLanguages((current) =>
                    current.map((l) => (l.languageId === language.languageId ? { ...l, fluency } : l))
                  )
                }
              />
            ))}
          </View>
        </View>
      ))}

      <FieldGroup title="Accents" hint="Shown under your languages unless you turn accents off for the section.">
        <View className="flex-row flex-wrap gap-2">
          {state.editor.accentOptions.map((accent) => {
            const selected = accentIds.includes(accent.id)
            return (
              <Chip
                key={accent.id}
                label={accent.name}
                selected={selected}
                onPress={() =>
                  setAccentIds((current) =>
                    selected ? current.filter((id) => id !== accent.id) : [...current, accent.id]
                  )
                }
              />
            )
          })}
        </View>
      </FieldGroup>
    </EditorScreen>
  )
}
