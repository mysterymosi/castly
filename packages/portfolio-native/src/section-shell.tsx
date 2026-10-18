import type { ReactNode } from "react"
import { View, type ViewProps } from "react-native"

import { CARD_WIDTH, SECTION_HORIZONTAL_PADDING, SECTION_VERTICAL_PADDING } from "./constants"

type SectionShellProps = ViewProps & {
  cardWidth?: number
  children: ReactNode
}

/** Constrains section content to card width (no horizontal overflow). */
export function SectionShell({
  cardWidth = CARD_WIDTH,
  children,
  style,
  ...rest
}: SectionShellProps) {
  return (
    <View
      {...rest}
      style={[
        {
          width: cardWidth,
          maxWidth: "100%",
          alignSelf: "center",
          overflow: "hidden",
          paddingHorizontal: SECTION_HORIZONTAL_PADDING,
          paddingVertical: SECTION_VERTICAL_PADDING,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
