import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans"
import { fontFamily } from "@workspace/ui-tokens"

/**
 * Keys must match `fontFamily` in @workspace/ui-tokens.
 * Plus Jakarta Sans includes ẹ ọ ṣ ị ụ ṅ and combining tone marks.
 * Precomposed ǹ (U+01F9) and ḿ (U+1E3F) are not in the font.
 * Weights that share a face (`heading`/`bodyBold`, `headingSemibold`/`bodySemibold`) are
 * registered once per family name.
 */
const fontSources = [
  [fontFamily.display, PlusJakartaSans_800ExtraBold],
  [fontFamily.heading, PlusJakartaSans_700Bold],
  [fontFamily.headingSemibold, PlusJakartaSans_600SemiBold],
  [fontFamily.body, PlusJakartaSans_400Regular],
  [fontFamily.bodyMedium, PlusJakartaSans_500Medium],
  [fontFamily.bodySemibold, PlusJakartaSans_600SemiBold],
  [fontFamily.bodyBold, PlusJakartaSans_700Bold],
] as const

export const appFonts = Object.fromEntries(fontSources)
