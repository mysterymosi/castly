import { router } from "expo-router"
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { Switch, View } from "react-native"

import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { haptics } from "@/lib/haptics"
import { useStudio } from "@/studio/studio-provider"

/** A studio content editor: header with a save indicator, intro line, the latest save error. */
export function EditorScreen({
  title,
  intro,
  children,
  footer,
}: {
  title: string
  intro?: string
  children?: ReactNode
  footer?: ReactNode
}) {
  const { pending, actionError } = useStudio()
  return (
    <Screen
      scroll
      footer={footer}
      header={
        <ScreenHeader
          title={title}
          onBack={() => router.back()}
          right={
            pending ? (
              <Text variant="footnote" tone="muted" accessibilityLiveRegion="polite">
                Saving…
              </Text>
            ) : null
          }
        />
      }
      contentClassName="gap-6 pt-2 pb-10"
    >
      {intro ? (
        <Text variant="body" tone="muted">
          {intro}
        </Text>
      ) : null}
      {actionError ? <InlineError message={actionError} /> : null}
      {children}
    </Screen>
  )
}

export function FieldGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text variant="title-sm">{title}</Text>
        {hint ? (
          <Text variant="footnote" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  testID,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (next: boolean) => void
  testID?: string
}) {
  const { color } = useTokens()
  return (
    <View className="min-h-14 flex-row items-center gap-4">
      <View className="flex-1 gap-0.5">
        <Text variant="body-strong">{label}</Text>
        {hint ? (
          <Text variant="footnote" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onValueChange={(next) => {
          haptics.selection()
          onChange(next)
        }}
        trackColor={{ true: color.interested, false: color.surfaceMuted }}
        ios_backgroundColor={color.surfaceMuted}
      />
    </View>
  )
}

/** "dark_brown" → "Dark brown". Option values and enums are slugs. */
export function humanize(value: string) {
  const text = value.replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Saves `value` once it has been still for `delay` ms, and on leaving the screen. Saves never
 * overlap: a change made while one is in flight is saved after it, so the last value always wins.
 * A failed save is not retried until the value changes again (the error shows on the screen).
 */
export function useAutosave<T>(value: T, persist: (value: T) => Promise<boolean>, delay = 600) {
  const key = JSON.stringify(value)
  const latest = useRef({ value, key })
  const persistRef = useRef(persist)
  const saved = useRef(key)
  const failed = useRef<string | null>(null)
  const inFlight = useRef(false)

  useLayoutEffect(() => {
    latest.current = { value, key }
    persistRef.current = persist
  })

  const flush = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      // Keep going until the latest value is saved: edits made mid-save are picked up here.
      while (latest.current.key !== saved.current && latest.current.key !== failed.current) {
        const { value: snapshot, key: snapshotKey } = latest.current
        if (await persistRef.current(snapshot)) {
          saved.current = snapshotKey
          failed.current = null
        } else {
          failed.current = snapshotKey
        }
      }
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => void flush(), delay)
    return () => clearTimeout(timer)
  }, [key, delay, flush])

  useEffect(() => () => void flush(), [flush])
}
