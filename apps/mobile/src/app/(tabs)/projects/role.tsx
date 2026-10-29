import { useMutation, useQuery } from "@tanstack/react-query"
import {
  projectDetailSchema,
  roleFormOptionsSchema,
  type Role,
  type RoleFormOptions,
  type RoleRequirements,
} from "@workspace/schema"
import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { View } from "react-native"

import { errorMessage } from "@/auth/session-provider"
import { cacheProjectDetail } from "@/booker/project-cache"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { DateField } from "@/components/ui/date-field"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { ErrorState, InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { haptics } from "@/lib/haptics"
import { trpcQuery } from "@/trpc/query-client"

const BRIEF_MAX = 5000

/** "150,000" → 150000; blank → null; anything else → NaN (rejected before saving). */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s₦]/g, "")
  if (!cleaned) return null
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : Number.NaN
}

const amountText = (n: number | null) => (n === null ? "" : String(n))

function RoleHeader({ editing }: { editing: boolean }) {
  return (
    <ScreenHeader
      title={editing ? "Edit role" : "New role"}
      backIcon="close"
      onBack={() => router.back()}
    />
  )
}

export default function RoleFormScreen() {
  const { projectId, roleId } = useLocalSearchParams<{ projectId: string; roleId?: string }>()
  const editing = !!roleId
  const optionsQuery = useQuery(
    trpcQuery.role.formOptions.queryOptions(undefined, { select: roleFormOptionsSchema.parse }),
  )
  const projectQuery = useQuery(
    trpcQuery.project.get.queryOptions({ projectId }, { select: projectDetailSchema.parse }),
  )

  const options = optionsQuery.data
  const project = projectQuery.data
  if (options && project) {
    return (
      <RoleForm
        projectId={projectId}
        roleId={roleId}
        options={options}
        role={roleId ? project.roles.find((r) => r.id === roleId) : undefined}
      />
    )
  }
  const loadError = optionsQuery.error ?? projectQuery.error
  if (loadError) {
    return (
      <Screen header={<RoleHeader editing={editing} />} contentClassName="justify-center">
        <ErrorState message={errorMessage(loadError, "Could not load the role form")} />
      </Screen>
    )
  }
  return <LoadingState label="Loading role form" />
}

/**
 * Fields start from the saved role once, at mount: a background refetch of the project (after
 * the app comes back to the foreground, say) never overwrites what the booker is typing.
 */
function RoleForm({
  projectId,
  roleId,
  options,
  role,
}: {
  projectId: string
  roleId: string | undefined
  options: RoleFormOptions
  role: Role | undefined
}) {
  const editing = !!roleId
  const [name, setName] = useState(role?.name ?? "")
  const [brief, setBrief] = useState(role?.brief ?? "")
  const [categoryId, setCategoryId] = useState<string | null>(role?.categoryId ?? null)
  const [rateMin, setRateMin] = useState(amountText(role?.rateMin ?? null))
  const [rateMax, setRateMax] = useState(amountText(role?.rateMax ?? null))
  const [startsOn, setStartsOn] = useState<string | null>(role?.shootStartsOn ?? null)
  const [endsOn, setEndsOn] = useState<string | null>(role?.shootEndsOn ?? null)
  // Requirements are edited with filters (M8); keep whatever the role already has.
  const [requirements] = useState<RoleRequirements>(role?.requirements ?? {})
  const [error, setError] = useState<string | null>(null)
  const createRole = useMutation(
    trpcQuery.role.create.mutationOptions({ onSuccess: cacheProjectDetail }),
  )
  const updateRole = useMutation(
    trpcQuery.role.update.mutationOptions({ onSuccess: cacheProjectDetail }),
  )
  const pending = createRole.isPending || updateRole.isPending
  const header = <RoleHeader editing={editing} />

  const min = parseAmount(rateMin)
  const max = parseAmount(rateMax)
  const amountError =
    Number.isNaN(min) || Number.isNaN(max)
      ? "Enter amounts as numbers, e.g. 150000"
      : min !== null && max !== null && max < min
        ? "The maximum can't be below the minimum"
        : null
  const dateError =
    startsOn && endsOn && endsOn < startsOn ? "The shoot can't end before it starts" : null
  const canSave = name.trim().length > 0 && !amountError && !dateError

  async function save() {
    if (!canSave || pending) return
    setError(null)
    const fields = {
      name: name.trim(),
      brief: brief.trim() || null,
      categoryId,
      shootStartsOn: startsOn,
      shootEndsOn: endsOn,
      rateMin: min,
      rateMax: max,
      requirements,
    }
    try {
      if (roleId) await updateRole.mutateAsync({ roleId, ...fields })
      else await createRole.mutateAsync({ projectId, ...fields })
      haptics.success()
      router.back()
    } catch (caught) {
      haptics.error()
      setError(errorMessage(caught, "Could not save the role"))
    }
  }

  return (
    <Screen
      scroll
      header={header}
      footer={
        <View className="gap-3 pb-1">
          {error ? <InlineError message={error} /> : null}
          <Button
            label={editing ? "Save role" : "Add role"}
            loading={pending}
            disabled={!canSave}
            onPress={save}
          />
        </View>
      }
      contentClassName="gap-6 pt-4"
    >
      <TextField
        label="Role"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Lead actress, 25–30, Yoruba-speaking"
        autoFocus={!editing}
        maxLength={120}
      />

      <View className="gap-3">
        <Text variant="label">Category</Text>
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {options.categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={categoryId === category.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: categoryId === category.id }}
              onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
            />
          ))}
        </View>
      </View>

      <TextField
        label="Brief"
        value={brief}
        onChangeText={setBrief}
        placeholder="Who is this character, what does the shoot involve, what matters most?"
        multiline
        maxLength={BRIEF_MAX}
        hint="Describe the character and the shoot. A role needs a brief before it can use sensitive requirements."
      />

      <View className="gap-3">
        <Text variant="label">Rate range (₦, optional)</Text>
        <View className="flex-row gap-3">
          <TextField
            label="Minimum"
            value={rateMin}
            onChangeText={setRateMin}
            placeholder="150000"
            keyboardType="number-pad"
            className="flex-1"
          />
          <TextField
            label="Maximum"
            value={rateMax}
            onChangeText={setRateMax}
            placeholder="300000"
            keyboardType="number-pad"
            className="flex-1"
          />
        </View>
        {amountError ? <InlineError message={amountError} /> : null}
      </View>

      <View className="gap-4">
        <DateField label="Shoot starts (optional)" value={startsOn} onChange={setStartsOn} />
        <DateField
          label="Shoot ends (optional)"
          value={endsOn}
          onChange={setEndsOn}
          minimumDate={startsOn}
        />
        {dateError ? <InlineError message={dateError} /> : null}
      </View>
    </Screen>
  )
}
