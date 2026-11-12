import type { StudioState } from "@workspace/schema"
import { useState } from "react"
import { View } from "react-native"

import { Button } from "@/components/ui/button"
import { PressableCard } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { cn } from "@/lib/cn"
import { studioApi } from "@/studio/api"
import { EditorScreen, FieldGroup, ToggleRow } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

type Kind = "day" | "half_day" | "project"
type Visibility = StudioState["talent"]["profile"]["rateVisibility"]

const kinds: { kind: Kind; label: string }[] = [
  { kind: "day", label: "Day rate" },
  { kind: "half_day", label: "Half-day rate" },
  { kind: "project", label: "Per project" },
]

const visibilityOptions: { value: Visibility; label: string; body: string }[] = [
  { value: "public", label: "Everyone", body: "Anyone who opens your page sees your rates." },
  {
    value: "verified_bookers",
    label: "Verified bookers",
    body: "Only bookers Castly has verified see them. Everyone else sees nothing.",
  },
  { value: "hidden", label: "No one", body: "Bookers see “On request” and ask you in chat." },
]

type Draft = { enabled: boolean; min: string; max: string; negotiable: boolean }

function amount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "")
  return digits ? Number(digits) : null
}

function draftsFrom(state: StudioState): Record<Kind, Draft> {
  const stored = new Map(state.talent.rates.map((r) => [r.kind, r]))
  return Object.fromEntries(
    kinds.map(({ kind }) => {
      const rate = stored.get(kind)
      return [
        kind,
        {
          enabled: !!rate,
          min: rate?.amountMin != null ? String(rate.amountMin) : "",
          max: rate?.amountMax != null ? String(rate.amountMax) : "",
          negotiable: rate?.negotiable ?? true,
        },
      ]
    })
  ) as Record<Kind, Draft>
}

/** Rates in naira and who sees them (2b.5). Rates save with the button; visibility on tap. */
export function RatesEditor({ state }: { state: StudioState }) {
  const { run, pending } = useStudio()
  const [drafts, setDrafts] = useState(() => draftsFrom(state))
  const [errors, setErrors] = useState<Partial<Record<Kind, string>>>({})
  const visibility = state.talent.profile.rateVisibility

  function patch(kind: Kind, next: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [kind]: { ...current[kind], ...next } }))
    setErrors((current) => ({ ...current, [kind]: undefined }))
  }

  async function save() {
    const nextErrors: Partial<Record<Kind, string>> = {}
    const rates = kinds.flatMap(({ kind }) => {
      const draft = drafts[kind]
      if (!draft.enabled) return []
      const amountMin = amount(draft.min)
      const amountMax = amount(draft.max)
      if (amountMin !== null && amountMax !== null && amountMin > amountMax)
        nextErrors[kind] = "The lowest can't be more than the highest"
      if (amountMin === null && amountMax === null && !draft.negotiable)
        nextErrors[kind] = "Add an amount, or turn on negotiable for “On request”"
      return [{ kind, amountMin, amountMax, currency: "NGN", negotiable: draft.negotiable }]
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    await run("rates", () => studioApi.setRates(rates), "Could not save your rates")
  }

  return (
    <EditorScreen
      title="Rates"
      intro="In naira. Leave the amounts empty with negotiable on to show “On request”."
      footer={
        <Button label="Save rates" loading={pending === "rates"} disabled={pending !== null} onPress={() => void save()} />
      }
    >
      {kinds.map(({ kind, label }) => {
        const draft = drafts[kind]
        return (
          <View key={kind} className="gap-3">
            <ToggleRow label={label} value={draft.enabled} onChange={(enabled) => patch(kind, { enabled })} />
            {draft.enabled ? (
              <>
                <View className="flex-row gap-3">
                  <TextField
                    className="flex-1"
                    label="From (₦)"
                    value={draft.min}
                    keyboardType="number-pad"
                    placeholder="150000"
                    onChangeText={(min) => patch(kind, { min })}
                  />
                  <TextField
                    className="flex-1"
                    label="To (₦)"
                    value={draft.max}
                    keyboardType="number-pad"
                    placeholder="Optional"
                    error={errors[kind]}
                    onChangeText={(max) => patch(kind, { max })}
                  />
                </View>
                <ToggleRow
                  label="Negotiable"
                  value={draft.negotiable}
                  onChange={(negotiable) => patch(kind, { negotiable })}
                />
              </>
            ) : null}
          </View>
        )
      })}

      <FieldGroup
        title="Who sees your rates"
        hint="Hiding your rates never lowers where you show up in decks or search."
      >
        <View className="gap-2" accessibilityRole="radiogroup">
          {visibilityOptions.map((option) => {
            const selected = visibility === option.value
            return (
              <PressableCard
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${option.label}. ${option.body}`}
                onPress={() => {
                  if (!selected)
                    void run(
                      "rate-visibility",
                      () => studioApi.updateProfile({ rateVisibility: option.value }),
                      "Could not change who sees your rates"
                    )
                }}
                className={cn("flex-row items-center gap-3 p-4", selected && "border-2 border-focus")}
              >
                <View className="flex-1 gap-0.5">
                  <Text variant="body-strong">{option.label}</Text>
                  <Text variant="footnote" tone="muted">
                    {option.body}
                  </Text>
                </View>
                {selected ? <Icon name="check" size={18} /> : null}
              </PressableCard>
            )
          })}
        </View>
      </FieldGroup>
    </EditorScreen>
  )
}
