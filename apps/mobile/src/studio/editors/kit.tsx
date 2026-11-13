import { router, useNavigation } from "expo-router"
import { usePreventRemove } from "expo-router/react-navigation"
import { useEffect, useState, type ReactNode } from "react"
import { Alert, Switch, View } from "react-native"

import { Button } from "@/components/ui/button"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { haptics } from "@/lib/haptics"
import { useStudio } from "@/studio/studio-provider"

export type EditorSave = {
  /** Whether the screen holds edits that aren't saved yet. */
  dirty: boolean
  /** Saves every edit; true on success. The screen closes after a successful save. */
  onSave: () => Promise<boolean>
  label?: string
  /** Blocks the button (e.g. invalid input) without discarding the edits. */
  disabled?: boolean
}

/**
 * A studio editor: header, intro line, the latest save error, and one Save button. Edits stay on
 * the screen until Save (nothing saves on blur or on a timer); leaving with unsaved edits asks
 * first.
 */
export function EditorScreen({
  title,
  intro,
  children,
  save,
  footer,
}: {
  title: string
  intro?: string
  children?: ReactNode
  save?: EditorSave
  /** For screens without a draft (a list that opens its own forms): its main action. */
  footer?: ReactNode
}) {
  const navigation = useNavigation()
  const { actionError, clearActionError } = useStudio()
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const dirty = !!save?.dirty

  // A stale error from another screen doesn't belong here.
  useEffect(() => clearActionError(), [clearActionError])

  usePreventRemove(dirty && !closing, ({ data }) => {
    Alert.alert("Discard your changes?", "You haven't saved them.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ])
  })

  // Close once the guard is off (the render after a save), so leaving isn't stopped.
  useEffect(() => {
    if (closing) router.back()
  }, [closing])

  async function onSave() {
    if (!save) return
    setSaving(true)
    const ok = await save.onSave()
    setSaving(false)
    if (ok) setClosing(true)
  }

  return (
    <Screen
      scroll
      footer={
        save ? (
          <Button
            label={save.label ?? "Save"}
            size="md"
            style={{ minHeight: 48 }}
            loading={saving}
            disabled={!dirty || saving || !!save.disabled}
            onPress={() => void onSave()}
          />
        ) : (
          footer
        )
      }
      header={<ScreenHeader title={title} onBack={() => router.back()} />}
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

/** Whether a draft differs from what's saved (plain data only). */
export function isDirty(draft: unknown, saved: unknown) {
  return JSON.stringify(draft) !== JSON.stringify(saved)
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
