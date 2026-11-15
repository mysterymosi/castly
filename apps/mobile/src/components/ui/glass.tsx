import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect"
import { useEffect, useState, type ReactNode } from "react"
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from "react-native"

/** Glass where the system draws it: iOS 26 Liquid Glass, unless the user reduces transparency. */
function systemGlass() {
  if (Platform.OS !== "ios") return false
  try {
    // Some iOS 26 betas lack the API and crash on GlassView (expo/expo#40911).
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
  } catch {
    return false
  }
}

const SYSTEM_GLASS = systemGlass()

export function useGlass() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (!SYSTEM_GLASS) return
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced)
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduced)
    return () => sub.remove()
  }, [])
  return SYSTEM_GLASS && !reduced
}

/** Without system glass: the frosted tint the hero used before (light on the photo's dark scrim). */
const fallback: ViewStyle = { backgroundColor: "rgba(255, 255, 255, 0.16)" }

/**
 * A pane of regular Liquid Glass over a photo, always the dark variant (it sits on the hero's
 * dark scrim, whatever the app's scheme). Elsewhere it falls back to a translucent tint. `enabled`
 * lets cards behind the top one skip the GPU cost.
 */
export function GlassPane({
  style,
  interactive = false,
  enabled = true,
  children,
  fallbackStyle,
}: {
  style?: StyleProp<ViewStyle>
  interactive?: boolean
  enabled?: boolean
  children?: ReactNode
  /** Replaces the default tint when glass isn't drawn (e.g. an outline instead). */
  fallbackStyle?: ViewStyle
}) {
  const glass = useGlass()
  if (glass && enabled) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive={interactive}
        style={style}
      >
        {children}
      </GlassView>
    )
  }
  return <View style={[fallbackStyle ?? fallback, style]}>{children}</View>
}
