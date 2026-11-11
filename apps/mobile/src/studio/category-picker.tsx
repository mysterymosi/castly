import type { StudioState } from "@workspace/schema"
import { View } from "react-native"

import { Chip } from "@/components/ui/chip"
import { Text } from "@/components/ui/text"
import { haptics } from "@/lib/haptics"

export const CATEGORY_MAX = 3

/** Adds or removes `id`, keeping pick order (the first is primary) and at most `CATEGORY_MAX`. */
export function toggleCategory(current: string[], id: string) {
  if (current.includes(id)) return current.filter((c) => c !== id)
  if (current.length >= CATEGORY_MAX) {
    haptics.error()
    return current
  }
  return [...current, id]
}

/**
 * What the talent does, as up to three categories in pick order; the first is primary. A role
 * cast in a category only reaches talent who picked it.
 */
export function CategoryPicker({
  categories,
  value,
  onToggle,
}: {
  categories: StudioState["categories"]
  value: string[]
  onToggle: (id: string) => void
}) {
  const primary = categories.find((c) => c.id === value[0])
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2" accessibilityLabel="Categories">
        {categories.map((category) => {
          const selected = value.includes(category.id)
          return (
            <Chip
              key={category.id}
              label={category.name}
              selected={selected}
              disabled={!selected && value.length >= CATEGORY_MAX}
              onPress={() => onToggle(category.id)}
            />
          )
        })}
      </View>
      <Text variant="footnote" tone="muted">
        {primary
          ? `Bookers see you first as ${primary.name}. Your first pick is your primary; pick up to ${CATEGORY_MAX}.`
          : `Pick up to ${CATEGORY_MAX}. Your first pick is your primary.`}
      </Text>
    </View>
  )
}
