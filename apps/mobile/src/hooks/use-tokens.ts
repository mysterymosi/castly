import { colors, type ColorScheme } from "@workspace/ui-tokens"

import { useColorScheme } from "@/hooks/use-color-scheme"

export function useScheme(): ColorScheme {
  return useColorScheme() === "dark" ? "dark" : "light"
}

/** Raw token values for APIs that can't take a className (native tabs, SVG fills, ActivityIndicator). */
export function useTokens() {
  const scheme = useScheme()
  return { scheme, color: colors[scheme] }
}
