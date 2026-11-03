import { useMutation, useQuery } from "@tanstack/react-query"
import { shortlistDetailSchema, type ShortlistEntry } from "@workspace/schema"
import { Image } from "expo-image"
import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Alert, View } from "react-native"
import { LinearTransition } from "react-native-reanimated"

import { errorMessage } from "@/auth/session-provider"
import { cacheShortlistDetail } from "@/booker/shortlist-cache"
import { AnimatedView } from "@/components/ui/animated"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { PressableScale } from "@/components/ui/pressable-scale"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { EmptyState, ErrorState, InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/cn"
import { mediaUri } from "@/deck/deck-card"
import { trpcQuery } from "@/trpc/query-client"

/** The compare view takes two to four talents (PRD §7.2.2). */
const COMPARE_MIN = 2
const COMPARE_MAX = 4

const idOf = (entry: ShortlistEntry) => entry.card.talent.profile.userId

/** Photo, name, category and city, and the booker's note when there is one. */
function EntrySummary({ entry }: { entry: ShortlistEntry }) {
  const { card } = entry
  const { displayName, cityName } = card.talent.profile
  const lead = card.decision.leadMediaIds[0]
  const photoUrl = lead ? mediaUri(card, lead) : null
  const meta = [card.decision.categoryName, cityName].filter(Boolean).join(" · ")
  return (
    <>
      <View className="h-14 w-14 overflow-hidden rounded-md bg-surfaceMuted">
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={{ width: 56, height: 56 }} contentFit="cover" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Icon name="person" size={22} tone="textMuted" />
          </View>
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {displayName}
        </Text>
        {meta ? (
          <Text variant="footnote" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {entry.note ? (
          <Text variant="footnote" numberOfLines={2}>
            “{entry.note}”
          </Text>
        ) : null}
      </View>
    </>
  )
}

function entryLabel(entry: ShortlistEntry) {
  const { card } = entry
  const meta = [card.decision.categoryName, card.talent.profile.cityName].filter(Boolean).join(" · ")
  return [card.talent.profile.displayName, meta, entry.note ? `Note: ${entry.note}` : ""].filter(Boolean).join(", ")
}

function SelectRow({
  entry,
  selected,
  selectable,
  onToggle,
  testID,
}: {
  entry: ShortlistEntry
  selected: boolean
  selectable: boolean
  onToggle: () => void
  testID?: string
}) {
  return (
    <PressableScale
      haptic="selection"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: !selectable }}
      accessibilityLabel={entryLabel(entry)}
      accessibilityHint="Select to compare"
      disabled={!selectable}
      onPress={onToggle}
      testID={testID}
      className={cn(
        "flex-row items-center gap-3 rounded-lg border bg-surface p-3",
        selected ? "border-text" : "border-border",
        !selectable && "opacity-50",
      )}
    >
      <EntrySummary entry={entry} />
      <View
        className={cn(
          "h-6 w-6 items-center justify-center rounded-pill border",
          selected ? "border-text bg-inverse" : "border-border",
        )}
      >
        {selected ? <Icon name="check" size={14} tone="onInverse" /> : null}
      </View>
    </PressableScale>
  )
}

/** Edit mode: tap the talent to write a note; move them up or down, or take them off the list. */
function EditRow({
  entry,
  first,
  last,
  disabled,
  onNote,
  onMove,
  onRemove,
  testID,
}: {
  entry: ShortlistEntry
  first: boolean
  last: boolean
  disabled: boolean
  onNote: () => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  testID?: string
}) {
  const name = entry.card.talent.profile.displayName
  return (
    <AnimatedView
      layout={LinearTransition.duration(220)}
      className="flex-row items-center gap-1 rounded-lg border border-border bg-surface py-2 pl-3 pr-1"
    >
      {/* PressableScale's wrapper is full width; this lets the row's buttons keep their room. */}
      <View className="flex-1">
        <PressableScale
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel={entryLabel(entry)}
          accessibilityHint={entry.note ? "Edit note" : "Add a note"}
          disabled={disabled}
          onPress={onNote}
          testID={testID}
          className="flex-row items-center gap-3 py-1"
        >
          <EntrySummary entry={entry} />
        </PressableScale>
      </View>
      <IconButton
        icon="chevron-up"
        variant="ghost"
        size={40}
        accessibilityLabel={`Move ${name} up`}
        disabled={disabled || first}
        onPress={() => onMove(-1)}
      />
      <IconButton
        icon="chevron-down"
        variant="ghost"
        size={40}
        accessibilityLabel={`Move ${name} down`}
        disabled={disabled || last}
        onPress={() => onMove(1)}
      />
      <IconButton
        icon="close"
        variant="ghost"
        size={40}
        accessibilityLabel={`Remove ${name}`}
        disabled={disabled}
        onPress={onRemove}
      />
    </AnimatedView>
  )
}

/**
 * One shortlist's talents. Pick two to four to compare them side by side; in edit mode, add
 * notes, reorder, or remove.
 */
export default function ShortlistScreen() {
  const { shortlistId } = useLocalSearchParams<{ shortlistId: string }>()
  const detailQuery = useQuery(
    trpcQuery.shortlist.get.queryOptions({ shortlistId }, { select: shortlistDetailSchema.parse }),
  )
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const reorder = useMutation(trpcQuery.shortlist.reorder.mutationOptions({ onSuccess: cacheShortlistDetail }))
  const remove = useMutation(trpcQuery.shortlist.remove.mutationOptions({ onSuccess: cacheShortlistDetail }))
  const busy = reorder.isPending || remove.isPending

  const entries = detailQuery.data?.entries ?? []
  const header = (
    <ScreenHeader
      onBack={() => router.back()}
      right={
        entries.length > 0 ? (
          <Button
            label={editing ? "Done" : "Edit"}
            variant="ghost"
            size="md"
            onPress={() => {
              setEditing((on) => !on)
              setEditError(null)
            }}
            testID="shortlist-edit"
          />
        ) : null
      }
    />
  )
  if (!detailQuery.data && detailQuery.error) {
    return (
      <Screen edges={["top"]} header={header} contentClassName="justify-center">
        <ErrorState
          message={errorMessage(detailQuery.error, "Could not load this shortlist")}
          onRetry={() => void detailQuery.refetch()}
        />
      </Screen>
    )
  }
  if (!detailQuery.data) return <LoadingState label="Loading shortlist" />
  const { shortlist } = detailQuery.data
  // A talent removed here or by an undo elsewhere drops out of the selection.
  const picked = selected.filter((id) => entries.some((e) => idOf(e) === id))

  const toggle = (talentId: string) =>
    setSelected((current) =>
      current.includes(talentId) ? current.filter((id) => id !== talentId) : [...current, talentId],
    )

  async function edit(action: () => Promise<unknown>, fallback: string) {
    setEditError(null)
    try {
      await action()
    } catch (caught) {
      setEditError(errorMessage(caught, fallback))
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (busy || target < 0 || target >= entries.length) return
    const next = entries.map(idOf)
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    void edit(() => reorder.mutateAsync({ shortlistId, talentIds: next }), "Could not reorder")
  }

  function confirmRemove(entry: ShortlistEntry) {
    const name = entry.card.talent.profile.displayName
    Alert.alert(`Remove ${name}?`, `${name} comes off ${shortlist.name}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          void edit(() => remove.mutateAsync({ shortlistId, talentId: idOf(entry) }), "Could not remove"),
      },
    ])
  }

  const canCompare = picked.length >= COMPARE_MIN
  const footer =
    !editing && entries.length >= COMPARE_MIN ? (
      <Button
        label={canCompare ? `Compare ${picked.length}` : `Select ${COMPARE_MIN}–${COMPARE_MAX} to compare`}
        icon="layers"
        disabled={!canCompare}
        onPress={() =>
          router.push({
            pathname: "/projects/compare",
            params: { shortlistId, talentIds: picked.join(",") },
          })
        }
      />
    ) : undefined

  return (
    <Screen scroll edges={["top", "bottom"]} header={header} footer={footer} contentClassName="gap-4 pt-2">
      <View className="gap-1">
        <Text variant="display-sm">{shortlist.name}</Text>
        {shortlist.projectName ? (
          <Text variant="body-sm" tone="muted">
            {shortlist.projectName}
          </Text>
        ) : null}
      </View>
      {editError ? <InlineError message={editError} /> : null}
      {entries.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title="Nobody here yet"
          body={
            shortlist.roleId
              ? "Swipe right on talent while casting this role and they'll appear here."
              : "Talent you save for later, or swipe right on without a role, appears here."
          }
        />
      ) : editing ? (
        <View className="gap-2">
          {entries.map((entry, index) => (
            <EditRow
              key={idOf(entry)}
              testID={`shortlist-entry-${index}`}
              entry={entry}
              first={index === 0}
              last={index === entries.length - 1}
              disabled={busy}
              onNote={() =>
                router.push({
                  pathname: "/projects/note",
                  params: {
                    shortlistId,
                    talentId: idOf(entry),
                    name: entry.card.talent.profile.displayName,
                    note: entry.note ?? "",
                  },
                })
              }
              onMove={(direction) => move(index, direction)}
              onRemove={() => confirmRemove(entry)}
            />
          ))}
        </View>
      ) : (
        <View className="gap-2">
          {entries.map((entry, index) => (
            <SelectRow
              key={idOf(entry)}
              testID={`shortlist-entry-${index}`}
              entry={entry}
              selected={picked.includes(idOf(entry))}
              selectable={picked.includes(idOf(entry)) || picked.length < COMPARE_MAX}
              onToggle={() => toggle(idOf(entry))}
            />
          ))}
        </View>
      )}
    </Screen>
  )
}
