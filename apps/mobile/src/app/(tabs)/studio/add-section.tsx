import { corePortfolioSectionTypes } from "@workspace/schema"
import { router } from "expo-router"
import { ActivityIndicator, ScrollView, View } from "react-native"

import { Icon } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { studioApi } from "@/studio/api"
import { sectionMeta } from "@/studio/section-meta"
import { useStudio } from "@/studio/studio-provider"

export default function AddSectionSheet() {
  const { state, run, pending, actionError } = useStudio()
  const { color } = useTokens()
  const existing = new Set(state?.sections.map((s) => s.type))

  async function add(type: (typeof corePortfolioSectionTypes)[number]) {
    const ok = await run(`add:${type}`, () => studioApi.createSection(type), "Could not add section")
    if (ok) router.back()
  }

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="gap-2 px-5 pb-10 pt-6">
      <Text variant="title" className="mb-1">
        Add a section
      </Text>
      <Text variant="body-sm" tone="muted" className="mb-3">
        Sections appear on your portfolio in the order you set in the studio.
      </Text>
      {actionError ? <InlineError message={actionError} className="mb-2" /> : null}
      {corePortfolioSectionTypes.map((type) => {
        const meta = sectionMeta[type]
        const busy = pending === `add:${type}`
        return (
          <PressableScale
            key={type}
            haptic="selection"
            accessibilityLabel={`Add ${meta.label}. ${meta.description}`}
            accessibilityState={{ busy, disabled: pending !== null }}
            disabled={pending !== null}
            onPress={() => void add(type)}
            className="min-h-16 flex-row items-center gap-4 rounded-xl bg-surfaceMuted px-4 py-3"
          >
            <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface">
              <Icon name={meta.icon} size={18} />
            </View>
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text variant="body-strong">{meta.label}</Text>
                {existing.has(type) ? (
                  <Text variant="footnote" tone="muted">
                    · Added
                  </Text>
                ) : null}
              </View>
              <Text variant="footnote" tone="muted">
                {meta.description}
              </Text>
            </View>
            {busy ? <ActivityIndicator color={color.text} /> : <Icon name="plus" size={18} tone="textMuted" />}
          </PressableScale>
        )
      })}
    </ScrollView>
  )
}
