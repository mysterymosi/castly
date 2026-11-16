import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Alert, View } from "react-native"

import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { LoadingState } from "@/components/ui/states"
import { TextField } from "@/components/ui/text-field"
import { studioApi } from "@/studio/api"
import { asCreditType, creditTypeOptions, type CreditType } from "@/studio/editors/credit-types"
import { EditorScreen, FieldGroup, ToggleRow } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

const thisYear = new Date().getFullYear()

/** Add a credit, or edit one when opened with `id`. Verification is never set here (M7). */
export default function CreditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { state, run, pending } = useStudio()
  const existing = id ? state?.editor.credits.find((c) => c.id === id) : undefined

  const [title, setTitle] = useState(existing?.title ?? "")
  const [roleName, setRoleName] = useState(existing?.roleName ?? "")
  const [company, setCompany] = useState(existing?.productionCompany ?? "")
  const [year, setYear] = useState(existing?.year != null ? String(existing.year) : "")
  const [type, setType] = useState<CreditType | null>(asCreditType(existing?.type ?? null))
  const [link, setLink] = useState(existing?.link ?? "")
  const [signature, setSignature] = useState(existing?.isSignature ?? false)
  const [errors, setErrors] = useState<{ title?: string; year?: string; link?: string }>({})

  if (!state) return <LoadingState />

  async function save() {
    const nextErrors: typeof errors = {}
    if (!title.trim()) nextErrors.title = "Add the production's title"
    const yearNumber = year.trim() ? Number(year) : null
    if (yearNumber !== null && (!Number.isInteger(yearNumber) || yearNumber < 1900 || yearNumber > thisYear + 2))
      nextErrors.year = `Use a year from 1900 to ${thisYear + 2}`
    if (link.trim() && !/^https?:\/\/\S+\.\S+/.test(link.trim()))
      nextErrors.link = "Use a full link, starting https://"
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const fields = {
      title: title.trim(),
      roleName: roleName.trim() || null,
      productionCompany: company.trim() || null,
      year: yearNumber,
      type,
      link: link.trim() || null,
      isSignature: signature,
    }
    const ok = await run(
      "credit:save",
      () => (existing ? studioApi.updateCredit({ creditId: existing.id, ...fields }) : studioApi.createCredit(fields)),
      "Could not save the credit"
    )
    if (ok) router.back()
  }

  function remove() {
    if (!existing) return
    Alert.alert("Delete this credit?", existing.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const ok = await run("credit:delete", () => studioApi.deleteCredit(existing.id), "Could not delete the credit")
          if (ok) router.back()
        },
      },
    ])
  }

  return (
    <EditorScreen
      title={existing ? "Edit credit" : "Add a credit"}
      intro={existing?.verified ? "Verified. Changing the title, role, company or year removes the check." : undefined}
      footer={
        <View className="gap-2">
          <Button label="Save credit" loading={pending === "credit:save"} disabled={pending !== null} onPress={() => void save()} />
          {existing ? (
            <Button label="Delete credit" variant="ghost" disabled={pending !== null} onPress={remove} />
          ) : null}
        </View>
      }
    >
      <View className="gap-4">
        <TextField
          label="Title"
          value={title}
          maxLength={160}
          placeholder="The Wedding Party 3"
          error={errors.title}
          onChangeText={setTitle}
        />
        <TextField label="Your role" value={roleName} maxLength={120} placeholder="Lead, DP, Makeup lead…" onChangeText={setRoleName} />
        <TextField label="Production company" value={company} maxLength={120} onChangeText={setCompany} />
        <TextField
          label="Year"
          value={year}
          keyboardType="number-pad"
          maxLength={4}
          placeholder={String(thisYear)}
          error={errors.year}
          onChangeText={setYear}
        />
      </View>

      <FieldGroup title="Type">
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {creditTypeOptions.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: type === option.value }}
              selected={type === option.value}
              onPress={() => setType(type === option.value ? null : option.value)}
            />
          ))}
        </View>
      </FieldGroup>

      <TextField
        label="Link"
        value={link}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://"
        hint="A trailer, an IMDb page, a press piece"
        error={errors.link}
        onChangeText={setLink}
      />

      <ToggleRow
        label="Signature credit"
        hint="Shown on your deck card. Only one credit can be your signature."
        value={signature}
        onChange={setSignature}
      />
    </EditorScreen>
  )
}
