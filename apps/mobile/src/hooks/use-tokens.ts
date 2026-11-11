import { colors, type ColorScheme } from "@workspace/ui-tokens"

/**
 * The app is dark-only, like a player: `tailwind.config.js` binds the dark palette to `:root` and
 * the root layout pins native controls to dark too.
 */
export const appScheme: ColorScheme = "dark"

/** Raw token values for APIs that can't take a className (native tabs, SVG fills, ActivityIndicator). */
export function useTokens() {
  return { scheme: appScheme, color: colors[appScheme] }
}
