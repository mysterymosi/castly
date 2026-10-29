import { useMutation } from "@tanstack/react-query"
import { projectTypeLabels, projectTypes, type ProjectType } from "@workspace/schema"
import { router } from "expo-router"
import { useState } from "react"
import { View } from "react-native"

import { errorMessage } from "@/auth/session-provider"
import { cacheProjectDetail } from "@/booker/project-cache"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { haptics } from "@/lib/haptics"
import { trpcQuery } from "@/trpc/query-client"

export default function NewProjectScreen() {
  const [name, setName] = useState("")
  const [type, setType] = useState<ProjectType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const createProject = useMutation(
    trpcQuery.project.create.mutationOptions({ onSuccess: cacheProjectDetail }),
  )
  const pending = createProject.isPending

  async function create() {
    if (!name.trim() || pending) return
    setError(null)
    try {
      const project = await createProject.mutateAsync({ name: name.trim(), type })
      haptics.success()
      // Swap the sheet for the new project's page; back returns to the list.
      router.dismiss()
      router.push({ pathname: "/projects/[projectId]", params: { projectId: project.id } })
    } catch (caught) {
      haptics.error()
      setError(errorMessage(caught, "Could not create the project"))
    }
  }

  return (
    <Screen
      scroll
      header={<ScreenHeader title="New project" backIcon="close" onBack={() => router.back()} />}
      footer={
        <View className="gap-3 pb-1">
          {error ? <InlineError message={error} /> : null}
          <Button label="Create project" loading={pending} disabled={!name.trim()} onPress={create} />
        </View>
      }
      contentClassName="gap-6 pt-4"
    >
      <TextField
        label="Project name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Bank commercial — March"
        autoFocus
        maxLength={120}
        returnKeyType="done"
        onSubmitEditing={create}
      />
      <View className="gap-3">
        <Text variant="label">Type (optional)</Text>
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {projectTypes.map((value) => (
            <Chip
              key={value}
              label={projectTypeLabels[value]}
              selected={type === value}
              accessibilityRole="radio"
              accessibilityState={{ selected: type === value }}
              onPress={() => setType(type === value ? null : value)}
            />
          ))}
        </View>
      </View>
    </Screen>
  )
}
