import { useMutation, useQuery } from "@tanstack/react-query"
import { projectTypeLabels, type Match, type MatchBrief } from "@workspace/schema"
import { useState, type ReactNode } from "react"
import { ActivityIndicator, ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/ui/button"
import { Tag } from "@/components/ui/chip"
import { Icon, type IconName } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"
import { ErrorState, InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { shortDate } from "@/inbox/format"
import { errorMessage } from "@/trpc/client"
import { trpcQuery } from "@/trpc/query-client"

const shootDate = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})
const displayDay = (date: string) => shootDate.format(new Date(date + "T00:00:00Z"))

function shootLabel(brief: MatchBrief) {
  const days = [brief.shootStartsOn, brief.shootEndsOn].filter((date): date is string => !!date)
  return days.length ? [...new Set(days.map(displayDay))].join(" – ") : null
}

function rateLabel(brief: MatchBrief) {
  const money = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: brief.rateCurrency,
    maximumFractionDigits: 0,
  })
  const amounts = [brief.rateMin, brief.rateMax].filter((value): value is number => value != null)
  return amounts.length ? [...new Set(amounts.map((amount) => money.format(amount)))].join(" – ") : null
}

/**
 * The role brief over a chat, as a sheet. The talent reads what was offered; the booker also
 * shares it, refreshes it after editing the role, or picks a different role's brief.
 */
export function BriefSheet({
  match,
  onAttached,
  onClose,
}: {
  match: Match
  onAttached: (updated: Match) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const mayAttach = match.counterpart.role === "talent"
  const [choosing, setChoosing] = useState(mayAttach && !match.roleId && !match.brief)
  const action = useMutation(
    trpcQuery.match.attachBrief.mutationOptions({
      onSuccess: (updated) => {
        onAttached(updated)
        setChoosing(false)
      },
    })
  )
  const attach = (roleId?: string) => action.mutate({ matchId: match.id, roleId })

  let footer: ReactNode = null
  if (!choosing && match.brief && !mayAttach) {
    footer = <Button label="Reply in chat" icon="chat" onPress={onClose} />
  } else if (!choosing && mayAttach && (match.brief || match.roleId)) {
    footer = (
      <View className="gap-2">
        <Button
          label={match.brief ? "Share latest version" : "Share role brief"}
          icon={match.brief ? "refresh" : "share"}
          loading={action.isPending}
          onPress={() => attach(match.brief?.roleId)}
        />
        <Button
          label={match.brief ? "Share a different role" : "Choose another role"}
          variant="ghost"
          size="md"
          disabled={action.isPending}
          onPress={() => {
            action.reset()
            setChoosing(true)
          }}
        />
      </View>
    )
  }

  // The ScrollView is the sheet's root: react-native-screens lays a form sheet's first scroll
  // view out against the sheet, and one nested under a wrapper View collapses to no height.
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-6 px-5 pt-6"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {choosing ? (
        <RoleChooser
          loading={action.isPending}
          onAttach={attach}
          onCancel={match.brief || match.roleId ? () => setChoosing(false) : undefined}
        />
      ) : match.brief ? (
        <BriefDetails brief={match.brief} sharedAt={match.briefAttachedAt} mine={mayAttach} />
      ) : (
        <NoBriefYet name={match.counterpart.name} />
      )}
      {action.isError ? (
        <InlineError message={errorMessage(action.error, "Could not share this brief.")} />
      ) : null}
      {footer ? <View className="gap-2 pt-2">{footer}</View> : null}
    </ScrollView>
  )
}

function BriefDetails({
  brief,
  sharedAt,
  mine,
}: {
  brief: MatchBrief
  sharedAt: string | null
  mine: boolean
}) {
  const shoot = shootLabel(brief)
  const rate = rateLabel(brief)
  return (
    <>
      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="caption" tone="accent">
            Role brief
          </Text>
          {sharedAt ? (
            <Text variant="footnote" tone="muted">
              {mine ? "You shared this" : "Shared"} {shortDate(sharedAt)}
            </Text>
          ) : null}
        </View>
        <Text variant="display-sm" selectable>
          {brief.roleName}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Tag icon="briefcase" label={brief.projectName} />
          {brief.projectType ? <Tag icon="film" label={projectTypeLabels[brief.projectType]} /> : null}
        </View>
      </View>

      <View className="flex-row gap-3">
        <Fact icon="calendar" label="Shoot dates" value={shoot} />
        <Fact icon="money" label="Rate" value={rate} />
      </View>

      <View className="gap-2">
        <Text variant="label">About the role</Text>
        <Text selectable>
          {brief.brief}
        </Text>
      </View>
    </>
  )
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string | null }) {
  return (
    <View className="flex-1 gap-2 rounded-lg bg-surfaceMuted p-4" style={{ borderCurve: "continuous" }}>
      <View className="flex-row items-center gap-1.5">
        <Icon name={icon} size={15} tone="textMuted" />
        <Text variant="footnote" tone="muted">
          {label}
        </Text>
      </View>
      <Text variant="body-strong" tone={value ? "default" : "muted"} selectable>
        {value ?? "To be confirmed"}
      </Text>
    </View>
  )
}

function NoBriefYet({ name }: { name: string }) {
  return (
    <View className="items-center gap-3 py-6">
      <View className="h-14 w-14 items-center justify-center rounded-pill bg-accent/20">
        <Icon name="brief" size={24} tone="accentText" />
      </View>
      <Text variant="title-sm" className="text-center">
        Share a role brief
      </Text>
      <Text variant="body-sm" tone="muted" className="text-center">
        {name} will see the role, shoot dates, rate and your written brief. Sensitive requirements
        stay private.
      </Text>
    </View>
  )
}

function ChoiceRow({
  title,
  subtitle,
  loading,
  disabled,
  onPress,
}: {
  title: string
  subtitle?: string
  loading?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const { color } = useTokens()
  return (
    <PressableScale
      haptic="selection"
      pressedScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 rounded-lg bg-surfaceMuted px-4 py-3"
      style={{ borderCurve: "continuous", opacity: disabled && !loading ? 0.5 : 1 }}
    >
      <View className="flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator color={color.textMuted} />
      ) : (
        <Icon name="chevron-right" size={16} tone="textMuted" />
      )}
    </PressableScale>
  )
}

function RoleChooser({
  loading,
  onAttach,
  onCancel,
}: {
  loading: boolean
  onAttach: (roleId: string) => void
  onCancel?: () => void
}) {
  const [projectId, setProjectId] = useState("")
  const [selectedRole, setSelectedRole] = useState<string>()
  const projects = useQuery(trpcQuery.project.list.queryOptions({ includeArchived: true }))
  const project = useQuery(
    trpcQuery.project.get.queryOptions({ projectId }, { enabled: !!projectId })
  )

  const heading = (title: string, body: string, back?: { label: string; onPress: () => void }) => (
    <View className="gap-2">
      {back ? (
        <Button
          label={back.label}
          icon="chevron-left"
          variant="ghost"
          size="md"
          disabled={loading}
          className="self-start"
          onPress={back.onPress}
        />
      ) : null}
      <Text variant="title">{title}</Text>
      <Text variant="body-sm" tone="muted">
        {body}
      </Text>
    </View>
  )

  if (!projects.data) {
    return projects.isError ? (
      <ErrorState message="Could not load projects." onRetry={() => void projects.refetch()} />
    ) : (
      <LoadingState label="Loading projects" />
    )
  }

  if (projectId) {
    const roles = project.data?.roles.filter((role) => !!role.brief)
    return (
      <View className="gap-5">
        {heading(project.data?.name ?? "Roles", "Only roles with a written brief can be shared.", {
          label: "Projects",
          onPress: () => {
            setProjectId("")
            setSelectedRole(undefined)
          },
        })}
        {project.isError ? (
          <ErrorState message="Could not load this project's roles." onRetry={() => void project.refetch()} />
        ) : !roles ? (
          <LoadingState label="Loading roles" />
        ) : roles.length === 0 ? (
          <Text tone="muted">This project has no roles with a written brief yet.</Text>
        ) : (
          <View className="gap-2">
            {roles.map((role) => (
              <ChoiceRow
                key={role.id}
                title={role.name}
                subtitle={loading && selectedRole === role.id ? "Sharing…" : "Share this brief"}
                loading={loading && selectedRole === role.id}
                disabled={loading}
                onPress={() => {
                  setSelectedRole(role.id)
                  onAttach(role.id)
                }}
              />
            ))}
          </View>
        )}
      </View>
    )
  }

  const choices = projects.data.projects.filter((item) => item.roleCount > 0)
  return (
    <View className="gap-5">
      {heading(
        "Choose a role",
        "Pick the project, then the role whose brief you want to share.",
        onCancel ? { label: "Brief", onPress: onCancel } : undefined
      )}
      {choices.length === 0 ? (
        <Text tone="muted">Add a role with a written brief in Projects to share it here.</Text>
      ) : (
        <View className="gap-2">
          {choices.map((item) => (
            <ChoiceRow
              key={item.id}
              title={item.name}
              subtitle={[
                `${item.roleCount} ${item.roleCount === 1 ? "role" : "roles"}`,
                item.type ? projectTypeLabels[item.type] : null,
                item.status === "archived" ? "Archived" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              onPress={() => setProjectId(item.id)}
            />
          ))}
        </View>
      )}
    </View>
  )
}
