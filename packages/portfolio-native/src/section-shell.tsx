import type { ReactNode } from "react"
import { StyleSheet, Text, View, type ViewProps } from "react-native"

import { CARD_WIDTH, SECTION_HORIZONTAL_PADDING, SECTION_VERTICAL_PADDING } from "./constants"

type SectionShellProps = ViewProps & {
  cardWidth?: number
  className?: string
  children: ReactNode
}

/** Constrains section content to card width (no horizontal overflow). */
export function SectionShell({
  cardWidth = CARD_WIDTH,
  children,
  className,
  style,
  ...rest
}: SectionShellProps) {
  return (
    <View
      {...rest}
      className={["self-center overflow-hidden bg-surface", className].filter(Boolean).join(" ")}
      style={StyleSheet.flatten([
        {
          width: cardWidth,
          maxWidth: "100%",
          paddingHorizontal: SECTION_HORIZONTAL_PADDING,
          paddingVertical: SECTION_VERTICAL_PADDING,
        },
        style,
      ])}
    >
      {children}
    </View>
  )
}

/** Section heading. Exactly SECTION_TITLE_HEIGHT tall (24 line height + 4 margin). */
export function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      numberOfLines={1}
      maxFontSizeMultiplier={1.3}
      className="mb-1 font-headingSemibold text-body text-text"
    >
      {children}
    </Text>
  )
}
