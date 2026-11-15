import { colors, type ColorScheme } from "@workspace/ui-tokens"
import { useColorScheme } from "react-native"

/** The scheme in effect: the choice in Account, else the phone's (`theme/appearance.ts`). */
export function useScheme(): ColorScheme {
  return useColorScheme() === "dark" ? "dark" : "light"
}

/** Raw token values for APIs that can't take a className (native tabs, SVG fills, ActivityIndicator). */
export function useTokens() {
  const scheme = useScheme()
  return { scheme, color: colors[scheme] }
}
