import { useMutation, useQuery } from "@tanstack/react-query"
import { projectDetailSchema, projectTypeLabels, type Role } from "@workspace/schema"
import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Alert, View } from "react-native"

import { errorMessage } from "@/auth/session-provider"
import { cacheProjectDetail } from "@/booker/project-cache"
import { Button } from "@/components/ui/button"
import { PressableCard } from "@/components/ui/card"
import { Tag } from "@/components/ui/chip"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { EmptyState, ErrorState, InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { haptics } from "@/lib/haptics"
import { trpcQuery } from "@/trpc/query-client"

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)

const day = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "UTC" })
const isoDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`))

function roleFacts(role: Role): string[] {
  const facts: string[] = []
  if (role.categoryName) facts.push(role.categoryName)
  if (role.rateMin !== null || role.rateMax !== null) {
    const parts = [role.rateMin, role.rateMax].filter((n): n is number => n !== null)
    facts.push(parts.map((n) => money(n, role.rateCurrency)).join(" – "))
  }
  if (role.shootStartsOn || role.shootEndsOn) {
    facts.push([role.shootStartsOn, role.shootEndsOn].filter(Boolean).map((d) => isoDay(d!)).join(" – "))
  }
  return facts
}

function RoleCard({ role, editable }: { role: Role; editable: boolean }) {
  return (
    <PressableCard
      accessibilityRole="button"
      accessibilityLabel={`Role: ${role.name}`}
      disabled={!editable}
      onPress={() =>
        router.push({ pathname: "/projects/role", params: { projectId: role.projectId, roleId: role.id } })
      }
      className="gap-2"
    >
      <Text variant="body-strong">{role.name}</Text>
      {role.brief ? (
        <Text variant="body-sm" tone="muted" numberOfLines={3}>
          {role.brief}
        </Text>
      ) : (
        <Text variant="body-sm" tone="muted">
          No brief yet — add one to describe what you’re looking for.
        </Text>
      )}
      {roleFacts(role).length > 0 ? (
        <View className="flex-row flex-wrap gap-2 pt-1">
          {roleFacts(role).map((fact) => (
            <Tag key={fact} label={fact} />
          ))}
        </View>
      ) : null}
    </PressableCard>
  )
}

export default function ProjectScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>()
  const projectQuery = useQuery(
    trpcQuery.project.get.queryOptions({ projectId }, { select: projectDetailSchema.parse }),
  )
  const archiveProject = useMutation(
    trpcQuery.project.archive.mutationOptions({ onSuccess: cacheProjectDetail }),
  )
  const [error, setError] = useState<string | null>(null)

  const project = projectQuery.data
  if (!project && projectQuery.error) {
    return (
      <Screen edges={["top"]} header={<ScreenHeader onBack={() => router.back()} />} contentClassName="justify-center">
        <ErrorState
          message={errorMessage(projectQuery.error, "Could not load this project")}
          onRetry={() => void projectQuery.refetch()}
        />
      </Screen>
    )
  }
  if (!project) return <LoadingState label="Loading project" />

  const active = project.status === "active"
  const archiving = archiveProject.isPending

  async function archive() {
    setError(null)
    try {
      await archiveProject.mutateAsync({ projectId })
      haptics.success()
      router.back()
    } catch (caught) {
      haptics.error()
      setError(errorMessage(caught, "Could not archive the project"))
    }
  }

  function confirmArchive() {
    Alert.alert(
      "Archive this project?",
      "It leaves your project list and becomes read-only.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: () => void archive() },
      ],
    )
  }

  return (
    <Screen
      scroll
      edges={["top"]}
      header={<ScreenHeader onBack={() => router.back()} />}
      contentClassName="gap-5 pt-2"
    >
      <View className="gap-2">
        <Text variant="display-sm">{project.name}</Text>
        <View className="flex-row flex-wrap gap-2">
          {project.type ? <Tag label={projectTypeLabels[project.type]} icon="film" /> : null}
          {!active ? <Tag label="Archived" icon="lock" /> : null}
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <Text variant="title-sm">Roles</Text>
        {active ? (
          <Button
            label="Add role"
            icon="plus"
            size="md"
            variant="secondary"
            onPress={() => router.push({ pathname: "/projects/role", params: { projectId: project.id } })}
          />
        ) : null}
      </View>

      {project.roles.length === 0 ? (
        <EmptyState
          icon="person"
          title="No roles yet"
          body="Add a role with a written brief — e.g. “Lead actress, 25–30, Yoruba-speaking”."
        />
      ) : (
        <View className="gap-3">
          {project.roles.map((role) => (
            <RoleCard key={role.id} role={role} editable={active} />
          ))}
        </View>
      )}

      {active ? (
        <View className="gap-3 pt-4">
          {error ? <InlineError message={error} /> : null}
          <Button label="Archive project" variant="ghost" icon="lock" loading={archiving} onPress={confirmArchive} />
        </View>
      ) : null}
    </Screen>
  )
}
