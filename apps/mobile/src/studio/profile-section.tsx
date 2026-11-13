import type { ReactNode } from "react"
import { Pressable, View } from "react-native"

import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/cn"

/**
 * One studio section, Bumble-style: a heading, a line on what goes here, then its field. The
 * talent fills things in; where they show on the portfolio is decided for them.
 */
export function ProfileSection({
  title,
  subtitle,
  warn = false,
  children,
}: {
  title: string
  subtitle?: string
  /** The subtitle is a problem to fix (e.g. no category: invisible to every role). */
  warn?: boolean
  children: ReactNode
}) {
  return (
    <View className="mt-10 gap-4">
      <View className="gap-1.5">
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" tone={warn ? "pass" : "muted"}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

const field = "min-h-[60px] flex-row items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"

/** Tappable field box: `+` while empty, `>` once it holds something. */
export function FieldBox({
  filled,
  accessibilityLabel,
  onPress,
  children,
}: {
  filled: boolean
  accessibilityLabel: string
  onPress: () => void
  children: ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={filled ? "Edit" : "Add"}
      onPress={onPress}
      className={cn(field, "active:opacity-70")}
    >
      <View className="flex-1">{children}</View>
      <Icon name={filled ? "chevron-right" : "plus"} size={filled ? 18 : 22} tone="text" />
    </Pressable>
  )
}

/** "Add your …" while empty. */
export function AddField({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <FieldBox filled={false} accessibilityLabel={label} onPress={onPress}>
      <Text variant="body">{label}</Text>
    </FieldBox>
  )
}

const MAX_PILLS = 6

/** What the talent entered, as pills; the rest collapse into "+N". */
export function PillsField({
  title,
  values,
  emptyLabel,
  onPress,
}: {
  title: string
  values: string[]
  emptyLabel: string
  onPress: () => void
}) {
  if (values.length === 0) return <AddField label={emptyLabel} onPress={onPress} />
  const shown = values.slice(0, MAX_PILLS)
  const more = values.length - shown.length
  return (
    <FieldBox filled accessibilityLabel={`${title}: ${values.join(", ")}`} onPress={onPress}>
      <View className="flex-row flex-wrap gap-2">
        {shown.map((value, i) => (
          <Pill key={`${value}-${i}`} label={value} />
        ))}
        {more > 0 ? <Pill label={`+${more}`} /> : null}
      </View>
    </FieldBox>
  )
}

function Pill({ label }: { label: string }) {
  return (
    <View className="min-h-10 justify-center rounded-pill border-[1.5px] border-text bg-surfaceMuted px-3">
      <Text variant="body-sm" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/** Free text (the bio), a few lines of it. */
export function TextBoxField({
  title,
  text,
  emptyLabel,
  onPress,
}: {
  title: string
  text: string | null
  emptyLabel: string
  onPress: () => void
}) {
  if (!text) return <AddField label={emptyLabel} onPress={onPress} />
  return (
    <FieldBox filled accessibilityLabel={`${title}: ${text}`} onPress={onPress}>
      <Text variant="body" numberOfLines={3}>
        {text}
      </Text>
    </FieldBox>
  )
}
