import { View, type ViewProps } from "react-native"
import Svg, { G, Path } from "react-native-svg"

import logoPaths from "@/assets/brand/logo-paths.json"
import { useTokens } from "@/hooks/use-tokens"

type LogoProps = Omit<ViewProps, "children"> & {
  /** `mark` and `wordmark` are kept separate so the name can change without touching the mark. */
  variant?: "mark" | "wordmark" | "lockup"
  /** Height in px. The wordmark is drawn at ~70% of the mark's height in a lockup. */
  size?: number
  /** Mark colour. Defaults to the brand accent. */
  color?: string
  /** Wordmark colour. Defaults to the primary text colour. */
  wordmarkColor?: string
}

const { mark, wordmark } = logoPaths

function Mark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${mark.width} ${mark.height}`}>
      <G fill={color}>
        {mark.paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </G>
    </Svg>
  )
}

function Wordmark({ height, color }: { height: number; color: string }) {
  const width = (wordmark.width / wordmark.height) * height
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${wordmark.width} ${wordmark.height}`}>
      <Path fill={color} transform={wordmark.transform} d={wordmark.path} />
    </Svg>
  )
}

export function Logo({
  variant = "lockup",
  size = 32,
  color,
  wordmarkColor,
  accessibilityLabel = "Castly",
  ...rest
}: LogoProps) {
  const { color: tokens } = useTokens()
  const markColor = color ?? tokens.accent
  const textColor = wordmarkColor ?? tokens.text

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      className="flex-row items-center gap-2"
      {...rest}
    >
      {variant !== "wordmark" ? <Mark size={size} color={markColor} /> : null}
      {variant !== "mark" ? (
        <Wordmark height={variant === "lockup" ? size * 0.62 : size} color={textColor} />
      ) : null}
    </View>
  )
}
