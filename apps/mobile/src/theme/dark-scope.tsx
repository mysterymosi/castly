import { colors, hexToRgbChannels } from "@workspace/ui-tokens"
import { vars } from "nativewind"
import { View, type ViewProps } from "react-native"

/** The dark palette as CSS variables, for a subtree whatever the app's scheme. */
const darkPalette = vars(
  Object.fromEntries(
    Object.entries(colors.dark).map(([role, hex]) => [`--color-${role}`, hexToRgbChannels(hex)])
  )
)

/**
 * Pins its children's token classes to the dark palette: text over a photo's dark scrim stays
 * light in light mode too. Only className tokens follow it; JS token props (Icon `tone`) don't.
 */
export function DarkScope({ style, ...rest }: ViewProps) {
  return <View style={[darkPalette, style]} {...rest} />
}
