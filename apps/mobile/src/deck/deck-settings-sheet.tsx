import { BottomSheet, RNHostView } from "@expo/ui"
import type { DeckGoal } from "@workspace/schema"
import { useWindowDimensions, View } from "react-native"

import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { DataSaverSetting } from "@/deck/data-saver-controls"
import { useTokens } from "@/hooks/use-tokens"

const GOAL_CHOICES = [5, 10, 20]

/**
 * The deck's settings, behind the header's sliders button (TikTok-style: the controls live off the
 * main surface): the session goal, data saver, and the role being cast for, when there is one.
 */
export function DeckSettingsSheet({
  open,
  onClose,
  goal,
  onGoalChange,
  roleName,
  onClearRole,
}: {
  open: boolean
  onClose: () => void
  goal: DeckGoal
  onGoalChange: (target: number | null) => void
  /** Set while the deck casts for a role. */
  roleName: string | null
  onClearRole: () => void
}) {
  const { color } = useTokens()
  // The sheet is its own window: React Native touches reach its content only through a host view,
  // which sizes it to its intrinsic width unless given the full one.
  const { width } = useWindowDimensions()
  return (
    <BottomSheet
      isPresented={open}
      onDismiss={onClose}
      containerColor={color.surface}
      contentPadding={0}
    >
      <RNHostView matchContents>
        <View
          className="gap-7 px-5 pt-6 pb-10"
          style={{ width, backgroundColor: color.surface }}
        >
          <Text variant="title">Deck settings</Text>

          {roleName !== null ? (
            <View className="flex-row items-center gap-4">
              <View className="rounded-pill bg-surfaceMuted h-11 w-11 items-center justify-center">
                <Icon name="film" size={18} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="body-strong" numberOfLines={1}>
                  Casting for {roleName || "a role"}
                </Text>
                <Text variant="footnote" tone="muted">
                  Interested lands on this role’s shortlist
                </Text>
              </View>
              <Button
                label="Clear"
                variant="secondary"
                size="md"
                className="px-4"
                onPress={onClearRole}
              />
            </View>
          ) : null}

          <View className="gap-3">
            <View className="gap-0.5">
              <Text variant="body-strong">Session goal</Text>
              <Text variant="footnote" tone="muted">
                {goal.target === null
                  ? "How many talents to shortlist before you stop"
                  : `${goal.shortlisted} of ${goal.target} shortlisted so far`}
              </Text>
            </View>
            <View
              className="flex-row flex-wrap gap-2"
              accessibilityRole="radiogroup"
            >
              <Chip
                label="No goal"
                selected={goal.target === null}
                onPress={() => onGoalChange(null)}
              />
              {GOAL_CHOICES.map((n) => (
                <Chip
                  key={n}
                  label={String(n)}
                  selected={goal.target === n}
                  onPress={() => onGoalChange(n)}
                />
              ))}
            </View>
          </View>

          <DataSaverSetting />
        </View>
      </RNHostView>
    </BottomSheet>
  )
}
