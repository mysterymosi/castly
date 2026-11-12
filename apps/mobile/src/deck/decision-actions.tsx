import { palette, shadow } from "@workspace/ui-tokens"
import { View } from "react-native"

import { Icon, type IconName } from "@/components/ui/icon"
import { PressableScale } from "@/components/ui/pressable-scale"

export type DeckDecision = "pass" | "interested" | "save"

/** Spotify's transport row: glass circles either side of a big white play button. */
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
      className={`rounded-pill items-center justify-center ${primary ? "h-[72px] w-[72px]" : "h-14 w-14"}`}
      style={
        primary
          ? { backgroundColor: "#FFFFFF", boxShadow: shadow.raised }
          : {
              backgroundColor: "rgba(255, 255, 255, 0.14)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.22)",
            }
      }
    >
      <Icon
        name={icon}
        size={primary ? 30 : 22}
        color={primary ? palette.ink : "#FFFFFF"}
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
      // The deck is dark, so each button uses light-on-dark colours whatever the system theme.
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
