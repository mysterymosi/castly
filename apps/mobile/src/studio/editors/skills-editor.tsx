import type { StudioState } from "@workspace/schema"
import { useState } from "react"
import { View } from "react-native"

import { Chip } from "@/components/ui/chip"
import { Text } from "@/components/ui/text"
import { haptics } from "@/lib/haptics"
import { studioApi } from "@/studio/api"
import { EditorScreen, FieldGroup, useAutosave } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

type Proficiency = StudioState["editor"]["skills"][number]["proficiency"]
const levels: { value: Proficiency; label: string }[] = [
  { value: "learning", label: "Learning" },
  { value: "competent", label: "Competent" },
  { value: "proficient", label: "Proficient" },
  { value: "expert", label: "Expert" },
]
const SKILL_MAX = 20

/** Skills in pick order (the first few are highlighted on the page), each with a self-rating. */
export function SkillsEditor({ state }: { state: StudioState }) {
  const { run } = useStudio()
  const [picked, setPicked] = useState(() => state.editor.skills)

  useAutosave(picked, (skills) =>
    run(
      "skills",
      () =>
        studioApi.setSkills({
          skillIds: skills.map((s) => s.skillId),
          proficiency: Object.fromEntries(skills.map((s) => [s.skillId, s.proficiency])),
        }),
      "Could not save your skills"
    )
  )

  function toggle(skillId: string) {
    setPicked((current) => {
      if (current.some((s) => s.skillId === skillId)) return current.filter((s) => s.skillId !== skillId)
      if (current.length >= SKILL_MAX) {
        haptics.error()
        return current
      }
      return [...current, { skillId, proficiency: "competent" }]
    })
  }

  const name = (id: string) => state.skills.find((s) => s.id === id)?.name ?? "Skill"

  return (
    <EditorScreen title="Skills" intro="What you can do on set. Bookers search by these.">
      <View className="flex-row flex-wrap gap-2" accessibilityLabel="Skills">
        {state.skills.map((skill) => (
          <Chip
            key={skill.id}
            label={skill.name}
            selected={picked.some((s) => s.skillId === skill.id)}
            onPress={() => toggle(skill.id)}
          />
        ))}
      </View>
      {picked.length < 3 ? (
        <Text variant="footnote" tone="pass">
          Keep at least 3 skills: publishing needs them.
        </Text>
      ) : null}

      {picked.length > 0 ? (
        <FieldGroup title="How good are you?" hint="Optional. Be honest: bookers will ask on set.">
          {picked.map((skill) => (
            <View key={skill.skillId} className="gap-2">
              <Text variant="body-strong">{name(skill.skillId)}</Text>
              <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
                {levels.map((level) => (
                  <Chip
                    key={level.value}
                    label={level.label}
                    accessibilityRole="radio"
                    accessibilityLabel={`${name(skill.skillId)}: ${level.label}`}
                    accessibilityState={{ selected: skill.proficiency === level.value }}
                    selected={skill.proficiency === level.value}
                    onPress={() =>
                      setPicked((current) =>
                        current.map((s) =>
                          s.skillId === skill.skillId ? { ...s, proficiency: level.value } : s
                        )
                      )
                    }
                  />
                ))}
              </View>
            </View>
          ))}
        </FieldGroup>
      ) : null}
    </EditorScreen>
  )
}
