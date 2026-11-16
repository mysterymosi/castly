import {
  AVAILABILITY_WINDOW_MONTHS,
  availabilityMonthKey,
  type StudioState,
} from "@workspace/schema"
import { useMemo, useState } from "react"
import { Pressable, useWindowDimensions, View } from "react-native"

import { Text } from "@/components/ui/text"
import { cn } from "@/lib/cn"
import { haptics } from "@/lib/haptics"
import { studioApi } from "@/studio/api"
import { EditorScreen, isDirty } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

type Status = "available" | "partial" | "booked"
const next: Record<Status, Status> = { available: "partial", partial: "booked", booked: "available" }
const statusLabel: Record<Status, string> = { available: "Free", partial: "Some days", booked: "Booked" }
const statusStyle: Record<Status, { box: string; tone: "default" | "onInverse" | "onPass" }> = {
  available: { box: "bg-surface border border-borderStrong", tone: "default" },
  partial: { box: "bg-accent/25 border border-accent", tone: "default" },
  booked: { box: "bg-pass", tone: "onPass" },
}

function monthName(key: string, withYear: boolean) {
  const [year, month] = key.split("-").map(Number)
  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    ...(withYear ? { year: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, 1)))
}

/**
 * Twelve months from this one; a tap cycles free → some days → booked (2b.6). Save stores the whole
 * strip, so a saved strip is what makes the section show; past months drop off on every save.
 */
export function AvailabilityEditor({ state }: { state: StudioState }) {
  const { run } = useStudio()
  // Three a row inside the screen's 20pt gutters, 8pt apart. Plain Pressable, not PressableScale:
  // its full-width wrapper breaks a wrapping grid (wrappers overlap and take each other's taps).
  const { width } = useWindowDimensions()
  const tileWidth = Math.floor((Math.min(width, 600) - 40 - 16) / 3)
  const months = useMemo(() => {
    const now = new Date()
    return Array.from({ length: AVAILABILITY_WINDOW_MONTHS }, (_, i) => availabilityMonthKey(now, i))
  }, [])
  const savedStatuses = useMemo(() => {
    const stored = new Map(state.talent.content.availability.map((m) => [m.month, m.status]))
    return Object.fromEntries(months.map((m) => [m, stored.get(m) ?? "available"])) as Record<string, Status>
  }, [months, state.talent.content.availability])
  const [statuses, setStatuses] = useState<Record<string, Status>>(() => savedStatuses)
  // A talent who never saved months has no strip; tapping one is what makes it worth saving.
  const [touched, setTouched] = useState(false)

  async function save() {
    return run(
      "availability",
      () => studioApi.setAvailability(months.map((month) => ({ month, status: statuses[month] ?? "available" }))),
      "Could not save your availability"
    )
  }

  return (
    <EditorScreen
      title="Availability"
      intro="Tap a month to cycle it: free, some days, booked. Bookers see the months ahead on your page."
      save={{
        // An all-free strip is still worth saving the first time: it shows bookers you're free.
        dirty: isDirty(statuses, savedStatuses) || (touched && state.talent.content.availability.length === 0),
        onSave: save,
      }}
    >
      <View className="flex-row flex-wrap gap-2" accessibilityLabel="Next 12 months">
        {months.map((month, i) => {
          const status = statuses[month] ?? "available"
          const style = statusStyle[status]
          const withYear = i === 0 || month.endsWith("-01")
          return (
            <Pressable
              key={month}
              accessibilityRole="button"
              accessibilityLabel={`${monthName(month, true)}: ${statusLabel[status]}`}
              accessibilityHint="Changes to the next status"
              onPress={() => {
                haptics.selection()
                setTouched(true)
                setStatuses((current) => ({ ...current, [month]: next[current[month] ?? "available"] }))
              }}
              className={cn("h-20 items-center justify-center gap-1 rounded-lg active:opacity-70", style.box)}
              style={{ width: tileWidth }}
            >
              <Text variant="body-strong" tone={style.tone}>
                {monthName(month, withYear)}
              </Text>
              <Text variant="footnote" tone={style.tone}>
                {statusLabel[status]}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </EditorScreen>
  )
}
