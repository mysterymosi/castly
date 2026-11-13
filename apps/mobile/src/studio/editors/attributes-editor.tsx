import {
  attributeAppliesTo,
  type AttributeDefinitionOption,
  type StudioState,
} from "@workspace/schema"
import { useState } from "react"
import { View } from "react-native"

import { Card } from "@/components/ui/card"
import { Chip } from "@/components/ui/chip"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { studioApi } from "@/studio/api"
import { EditorScreen, FieldGroup, humanize, isDirty, ToggleRow } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

type Stored = StudioState["editor"]["attributes"][number]
type SetInput = Parameters<typeof studioApi.setAttribute>[0]

/** "Height (cm)" → label "Height", unit "cm". Definitions carry the unit in the label. */
function splitUnit(label: string) {
  const match = /^(.*?)\s*\(([^)]+)\)$/.exec(label)
  return match ? { name: match[1]!, unit: match[2]! } : { name: label, unit: null }
}

/** One attribute as the editor holds it: text for text/number/select ("" is unset), or a bool. */
type Entry = { value: string | boolean; isVisible: boolean }

function savedEntry(definition: AttributeDefinitionOption, stored: Stored | undefined): Entry {
  const isVisible = stored?.isVisible ?? true
  if (definition.dataType === "boolean") return { value: stored?.valueBool ?? false, isVisible }
  return { value: stored?.valueText ?? (stored?.valueNum != null ? String(stored.valueNum) : ""), isVisible }
}

function hasValue(entry: Entry) {
  return typeof entry.value === "boolean" ? true : entry.value.trim() !== ""
}

/** The save for one changed entry, or an error message for bad input. */
function inputFor(
  definition: AttributeDefinitionOption,
  entry: Entry,
  was: Entry
): Omit<SetInput, "definitionKey"> | { error: string } {
  const visibility = entry.isVisible !== was.isVisible ? { isVisible: entry.isVisible } : {}
  if (typeof entry.value === "boolean") return { valueBool: entry.value, ...visibility }
  const text = entry.value.trim()
  // Nothing entered clears the value (and the row with it).
  if (!text) return {}
  if (definition.dataType === "number") {
    const value = Number(text.replace(",", "."))
    if (!Number.isFinite(value) || value < 0) return { error: "Use a number" }
    return { valueNum: value, ...visibility }
  }
  return { valueText: text, ...visibility }
}

function AttributeField({
  definition,
  entry,
  error,
  onChange,
}: {
  definition: AttributeDefinitionOption
  entry: Entry
  error?: string
  onChange: (value: string | boolean) => void
}) {
  const { name, unit } = splitUnit(definition.label)

  switch (definition.dataType) {
    case "boolean":
      return <ToggleRow label={definition.label} value={entry.value === true} onChange={onChange} />
    case "select":
    case "multi_select": {
      const multi = definition.dataType === "multi_select"
      const picked = typeof entry.value === "string" && entry.value ? entry.value.split(",") : []
      return (
        <View className="gap-2">
          <Text variant="label">{definition.label}</Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole={multi ? undefined : "radiogroup"}>
            {(definition.options ?? []).map((option) => {
              const selected = picked.includes(option)
              return (
                <Chip
                  key={option}
                  label={humanize(option)}
                  accessibilityLabel={`${definition.label}: ${humanize(option)}`}
                  selected={selected}
                  onPress={() => {
                    const next = multi
                      ? selected
                        ? picked.filter((p) => p !== option)
                        : [...picked, option]
                      : selected
                        ? []
                        : [option]
                    onChange(next.join(","))
                  }}
                />
              )
            })}
          </View>
        </View>
      )
    }
    case "number":
    case "text": {
      const numeric = definition.dataType === "number"
      return (
        <TextField
          label={unit ? `${name} (${unit})` : name}
          value={typeof entry.value === "string" ? entry.value : ""}
          keyboardType={numeric ? "decimal-pad" : "default"}
          maxLength={numeric ? 6 : 200}
          error={error}
          onChangeText={onChange}
        />
      )
    }
  }
}

/**
 * Attributes for the talent's categories, built from `attribute_definitions` (2b.7). A new
 * definition needs no app code: fields render by data type. Sensitive values are grouped apart.
 * Every change, including the eye, waits for Save.
 */
export function AttributesEditor({ state }: { state: StudioState }) {
  const { run } = useStudio()
  const parentOf = (id: string) => state.categories.find((c) => c.id === id)?.parentId
  const applicable = state.editor.attributeDefinitions.filter((d) =>
    attributeAppliesTo(d, state.categoryIds, parentOf)
  )
  const standard = applicable.filter((d) => d.tier === "standard")
  const sensitive = applicable.filter((d) => d.tier === "sensitive")
  const stored = new Map(state.editor.attributes.map((a) => [a.definitionId, a]))
  const savedEntries = Object.fromEntries(
    applicable.map((d) => [d.id, savedEntry(d, stored.get(d.id))])
  )

  const [draft, setDraft] = useState<Record<string, Entry>>(() => savedEntries)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function patch(id: string, next: Partial<Entry>) {
    setDraft((current) => ({ ...current, [id]: { ...current[id]!, ...next } }))
    setErrors((current) => {
      const { [id]: _, ...rest } = current
      return rest
    })
  }

  async function save() {
    const changed = applicable.filter((d) => draft[d.id] && isDirty(draft[d.id], savedEntries[d.id]))
    const inputs = changed.map((d) => [d, inputFor(d, draft[d.id]!, savedEntries[d.id]!)] as const)
    const bad = Object.fromEntries(
      inputs.flatMap(([d, input]) => ("error" in input ? [[d.id, input.error]] : []))
    )
    setErrors(bad)
    if (Object.keys(bad).length > 0) return false
    for (const [definition, input] of inputs) {
      if ("error" in input) continue
      const ok = await run(
        `attribute:${definition.key}`,
        () => studioApi.setAttribute({ definitionKey: definition.key, ...input }),
        `Could not save ${definition.label.toLowerCase()}`
      )
      if (!ok) return false
    }
    return true
  }

  function row(definition: AttributeDefinitionOption, { hideable }: { hideable: boolean }) {
    const entry = draft[definition.id] ?? savedEntry(definition, undefined)
    return (
      <View key={definition.id} className="flex-row items-start gap-2">
        <View className="flex-1">
          <AttributeField
            definition={definition}
            entry={entry}
            error={errors[definition.id]}
            onChange={(value) => patch(definition.id, { value })}
          />
        </View>
        {hideable && hasValue(entry) ? (
          <IconButton
            icon={entry.isVisible ? "eye" : "eye-off"}
            variant="ghost"
            className="mt-6"
            accessibilityLabel={
              entry.isVisible
                ? `${definition.label} shows on your page. Hide it`
                : `${definition.label} is hidden from your page. Show it`
            }
            onPress={() => patch(definition.id, { isVisible: !entry.isVisible })}
          />
        ) : null}
      </View>
    )
  }

  if (state.categoryIds.length === 0) {
    return (
      <EditorScreen title="Attributes" intro="Pick what you do first: the details asked depend on it." />
    )
  }

  return (
    <EditorScreen
      title="Attributes"
      intro="Casting details for what you do. Fill in what you're comfortable sharing."
      save={{ dirty: isDirty(draft, savedEntries), onSave: save }}
    >
      {standard.length > 0 ? (
        <FieldGroup title="On your page" hint="Use the eye to hide one without deleting it.">
          <View className="gap-5">{standard.map((d) => row(d, { hideable: true }))}</View>
        </FieldGroup>
      ) : null}

      {sensitive.length > 0 ? (
        <FieldGroup title="Private details">
          <Card className="flex-row gap-3">
            <Icon name="lock" size={18} tone="textMuted" />
            <Text variant="footnote" tone="muted" className="flex-1">
              Never shown on your page and never used to rank you. Only used to match you when a
              booker filters a role that has a written brief. Leave any of these empty.
            </Text>
          </Card>
          <View className="gap-5">{sensitive.map((d) => row(d, { hideable: false }))}</View>
        </FieldGroup>
      ) : null}
    </EditorScreen>
  )
}
