import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans"
import { fontFamily } from "@workspace/ui-tokens"

/**
 * Keys must match `fontFamily` in @workspace/ui-tokens.
 * Plus Jakarta Sans includes ẹ ọ ṣ ị ụ ṅ and combining tone marks.
 * Precomposed ǹ (U+01F9) and ḿ (U+1E3F) are not in the font.
 * `headingSemibold` and `bodySemibold` share one registered face.
 */
const fontSources = [
  [fontFamily.heading, PlusJakartaSans_700Bold],
  [fontFamily.headingSemibold, PlusJakartaSans_600SemiBold],
  [fontFamily.body, PlusJakartaSans_400Regular],
  [fontFamily.bodyMedium, PlusJakartaSans_500Medium],
  [fontFamily.bodySemibold, PlusJakartaSans_600SemiBold],
] as const

export const appFonts = Object.fromEntries(fontSources)
