import { projectTypeLabels, type ProjectSummary } from "@workspace/schema"
import { router, useFocusEffect } from "expo-router"
import { useCallback, useState } from "react"
import { View } from "react-native"

import { authApi } from "@/auth/client"
import { errorMessage, useSession } from "@/auth/session-provider"
import { bookerApi } from "@/booker/api"
import { projectApi } from "@/booker/project-api"
import { Button } from "@/components/ui/button"
import { PressableCard } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Screen } from "@/components/ui/screen"
import { EmptyState, ErrorState, InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"

type Loaded = { hasProfile: boolean; projects: ProjectSummary[] }

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
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(
    (isCurrent: () => boolean) =>
      Promise.all([bookerApi.getProfile(), projectApi.list()]).then(
        ([profile, list]) => {
          if (!isCurrent()) return
          setLoadError(null)
          setLoaded({ hasProfile: profile.profile !== null, projects: list.projects })
        },
        (caught: unknown) => {
          if (isCurrent()) setLoadError(errorMessage(caught, "Could not load your projects"))
        },
      ),
    [],
  )

  // Refresh whenever the tab regains focus (after creating, editing, or archiving).
  useFocusEffect(
    useCallback(() => {
      if (!isBooker) return
      let current = true
      void load(() => current)
      return () => {
        current = false
      }
    }, [isBooker, load]),
  )

  if (!isBooker) return <EnableBooker />
  if (loadError && !loaded) {
    return (
      <Screen edges={["top"]} contentClassName="justify-center">
        <ErrorState message={loadError} onRetry={() => void load(() => true)} />
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
