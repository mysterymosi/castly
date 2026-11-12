import { Redirect, useLocalSearchParams } from "expo-router"

import { LoadingState } from "@/components/ui/states"
import { AttributesEditor } from "@/studio/editors/attributes-editor"
import { AvailabilityEditor } from "@/studio/editors/availability-editor"
import { BasicsEditor } from "@/studio/editors/basics-editor"
import { CreditsEditor } from "@/studio/editors/credits-editor"
import { LanguagesEditor } from "@/studio/editors/languages-editor"
import { RatesEditor } from "@/studio/editors/rates-editor"
import { SkillsEditor } from "@/studio/editors/skills-editor"
import { useStudio } from "@/studio/studio-provider"

const editors = {
  about: BasicsEditor,
  credits: CreditsEditor,
  attributes: AttributesEditor,
  skills: SkillsEditor,
  languages: LanguagesEditor,
  rates: RatesEditor,
  availability: AvailabilityEditor,
} as const

/** One content editor per section type (2b.1); each saves through its own procedure. */
export default function SectionEditorScreen() {
  const { type } = useLocalSearchParams<{ type: string }>()
  const { state } = useStudio()
  if (!(type in editors)) return <Redirect href="/studio" />
  if (!state) return <LoadingState />
  const Editor = editors[type as keyof typeof editors]
  return <Editor state={state} />
}
