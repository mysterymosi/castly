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
import { EditorScreen, FieldGroup, humanize, ToggleRow } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

type Stored = StudioState["editor"]["attributes"][number]
type SetInput = Parameters<typeof studioApi.setAttribute>[0]

/** "Height (cm)" → label "Height", unit "cm". Definitions carry the unit in the label. */
function splitUnit(label: string) {
  const match = /^(.*?)\s*\(([^)]+)\)$/.exec(label)
  return match ? { name: match[1]!, unit: match[2]! } : { name: label, unit: null }
}

function AttributeField({
  definition,
  stored,
  onSave,
}: {
  definition: AttributeDefinitionOption
  stored: Stored | undefined
  onSave: (input: Omit<SetInput, "definitionKey">) => void
}) {
  const [text, setText] = useState(
    stored?.valueText ?? (stored?.valueNum != null ? String(stored.valueNum) : "")
  )
  const [error, setError] = useState<string | null>(null)
  const { name, unit } = splitUnit(definition.label)

  switch (definition.dataType) {
    case "boolean":
      return (
        <ToggleRow
          label={definition.label}
          value={stored?.valueBool ?? false}
          onChange={(valueBool) => onSave({ valueBool })}
        />
      )
    case "select":
    case "multi_select": {
      const multi = definition.dataType === "multi_select"
      const picked = stored?.valueText ? stored.valueText.split(",") : []
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
                    // Nothing picked clears the value.
                    onSave(next.length > 0 ? { valueText: next.join(",") } : {})
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
          value={text}
          keyboardType={numeric ? "decimal-pad" : "default"}
          maxLength={numeric ? 6 : 200}
          error={error}
          onChangeText={(value) => {
            setText(value)
            setError(null)
          }}
          onBlur={() => {
            const trimmed = text.trim()
            const was = stored?.valueText ?? (stored?.valueNum != null ? String(stored.valueNum) : "")
            if (trimmed === was) return
            if (!trimmed) return onSave({})
            if (!numeric) return onSave({ valueText: trimmed })
            const value = Number(trimmed.replace(",", "."))
            if (!Number.isFinite(value) || value < 0) return setError("Use a number")
            onSave({ valueNum: value })
          }}
        />
      )
    }
  }
}

/**
 * Attributes for the talent's categories, built from `attribute_definitions` (2b.7). A new
 * definition needs no app code: fields render by data type. Sensitive values are grouped apart.
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

  function save(definition: AttributeDefinitionOption, input: Omit<SetInput, "definitionKey">) {
    void run(
      `attribute:${definition.key}`,
      () => studioApi.setAttribute({ definitionKey: definition.key, ...input }),
      `Could not save ${definition.label.toLowerCase()}`
    )
  }

  function row(definition: AttributeDefinitionOption, { hideable }: { hideable: boolean }) {
    const value = stored.get(definition.id)
    return (
      <View key={definition.id} className="flex-row items-start gap-2">
        <View className="flex-1">
          <AttributeField definition={definition} stored={value} onSave={(input) => save(definition, input)} />
        </View>
        {hideable && value ? (
          <IconButton
            icon={value.isVisible ? "eye" : "eye-off"}
            variant="ghost"
            className="mt-6"
            accessibilityLabel={
              value.isVisible
                ? `${definition.label} shows on your page. Hide it`
                : `${definition.label} is hidden from your page. Show it`
            }
            onPress={() => save(definition, { isVisible: !value.isVisible })}
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
    <EditorScreen title="Attributes" intro="Casting details for what you do. Fill in what you're comfortable sharing.">
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
