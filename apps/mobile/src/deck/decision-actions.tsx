import { shadow } from "@workspace/ui-tokens"
import { View } from "react-native"

import { Icon, type IconName } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"

export type DeckDecision = "pass" | "interested" | "save"

/** Spotify's transport row: two quiet circles either side of a big ink one (tokens, so both schemes work). */
function ActionButton({
  icon,
  label,
  onPress,
  primary,
  testID,
}: {
  icon: IconName
  label: string
  onPress: () => void
  primary?: boolean
  testID?: string
}) {
  return (
    <PressableScale
      // The exit fires its own haptic at the moment the card commits; one per action.
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      className={`rounded-pill items-center justify-center ${primary ? "h-[72px] w-[72px] bg-inverse" : "h-14 w-14 border border-border bg-surface"}`}
      style={primary ? { boxShadow: shadow.raised } : undefined}
    >
      <Icon
        name={icon}
        size={primary ? 30 : 22}
        tone={primary ? "onInverse" : "text"}
      />
    </PressableScale>
  )
}

/**
 * Pass / Interested / Save, in the card at the end of its portfolio, above "Share portfolio".
 * Swiping the card passes or shows interest from anywhere; these are the buttons for a booker who
 * has read to the end.
 */
export function DecisionActions({
  onDecide,
}: {
  onDecide: (decision: DeckDecision) => void
}) {
  return (
    <View
      className="flex-row items-center justify-center"
      style={{ gap: 36 }}
    >
      <ActionButton
        icon="close"
        label="Pass"
        onPress={() => onDecide("pass")}
      />
      <ActionButton
        icon="check"
        label="Interested"
        primary
        onPress={() => onDecide("interested")}
      />
      <ActionButton
        icon="bookmark"
        label="Save for later"
        onPress={() => onDecide("save")}
      />
    </View>
  )
}
