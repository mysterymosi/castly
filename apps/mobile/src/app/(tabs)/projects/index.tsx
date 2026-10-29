import { useQuery } from "@tanstack/react-query"
import {
  bookerProfileStateSchema,
  projectListSchema,
  projectTypeLabels,
  type ProjectSummary,
} from "@workspace/schema"
import { router } from "expo-router"
import { useState } from "react"
import { View } from "react-native"

import { authApi } from "@/auth/client"
import { errorMessage, useSession } from "@/auth/session-provider"
import { Button } from "@/components/ui/button"
import { PressableCard } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Screen } from "@/components/ui/screen"
import { EmptyState, ErrorState, InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { queryClient, trpcQuery } from "@/trpc/query-client"

function EnableBooker() {
  const { refreshMe } = useSession()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enable() {
    setPending(true)
    setError(null)
    try {
      await authApi.enableMode("booker")
      await refreshMe()
      await queryClient.invalidateQueries(trpcQuery.booker.pathFilter())
      router.push("/booker-setup")
    } catch (caught) {
      setError(errorMessage(caught, "Could not enable booker mode"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen edges={["top"]} contentClassName="justify-center">
      <EmptyState
        icon="briefcase"
        title="Turn on booker mode"
        body="Projects hold the roles you're casting, each with a written brief."
      />
      <Button label="Enable booker mode" loading={pending} onPress={enable} className="mx-6" />
      {error ? <InlineError message={error} className="mx-6 mt-4" /> : null}
    </Screen>
  )
}

function ProjectRow({ project }: { project: ProjectSummary }) {
  const meta = [
    project.type ? projectTypeLabels[project.type] : null,
    project.roleCount === 1 ? "1 role" : `${project.roleCount} roles`,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <PressableCard
      accessibilityRole="button"
      accessibilityLabel={`${project.name}, ${meta}`}
      onPress={() => router.push({ pathname: "/projects/[projectId]", params: { projectId: project.id } })}
      className="flex-row items-center gap-3"
    >
      <View className="h-11 w-11 items-center justify-center rounded-pill bg-surfaceMuted">
        <Icon name="film" size={20} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {project.name}
        </Text>
        <Text variant="footnote" tone="muted">
          {meta}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} tone="textMuted" />
    </PressableCard>
  )
}

export default function ProjectsScreen() {
  const { me } = useSession()
  const isBooker = !!me?.modes.includes("booker")
  const profileQuery = useQuery(
    trpcQuery.booker.getProfile.queryOptions(undefined, {
      enabled: isBooker,
      select: bookerProfileStateSchema.parse,
    }),
  )
  const listQuery = useQuery(
    trpcQuery.project.list.queryOptions(
      { includeArchived: false },
      { enabled: isBooker, select: projectListSchema.parse },
    ),
  )

  if (!isBooker) return <EnableBooker />

  const loaded =
    profileQuery.data && listQuery.data
      ? { hasProfile: profileQuery.data.profile !== null, projects: listQuery.data.projects }
      : null
  const loadError = profileQuery.error ?? listQuery.error
  if (!loaded && loadError) {
    return (
      <Screen edges={["top"]} contentClassName="justify-center">
        <ErrorState
          message={errorMessage(loadError, "Could not load your projects")}
          onRetry={() => {
            void profileQuery.refetch()
            void listQuery.refetch()
          }}
        />
      </Screen>
    )
  }
  if (!loaded) return <LoadingState label="Loading projects" />

  if (!loaded.hasProfile) {
    return (
      <Screen edges={["top"]} contentClassName="justify-center">
        <EmptyState
          icon="briefcase"
          title="Finish your booker profile"
          body="Tell us what kind of work you do before you start a project."
          actionLabel="Set up booker profile"
          onAction={() => router.push("/booker-setup")}
        />
      </Screen>
    )
  }

  return (
    <Screen scroll edges={["top"]} contentClassName="gap-4 pt-4">
      <View className="flex-row items-center justify-between">
        <Text variant="display-sm">Projects</Text>
        <Button
          label="New project"
          icon="plus"
          size="md"
          variant="inverse"
          onPress={() => router.push("/projects/new")}
        />
      </View>
      {loaded.projects.length === 0 ? (
        <EmptyState
          icon="film"
          title="No projects yet"
          body="A project holds the roles you're casting — e.g. “Bank commercial — March”."
        />
      ) : (
        <View className="gap-3">
          {loaded.projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </View>
      )}
    </Screen>
  )
}
