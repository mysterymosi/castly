import { createElement, type ReactNode } from "react"

/**
 * react-native for the parity suite: host components render as plain HTML so the native
 * renderers go through react-dom/server like the web ones. Only the props the extractor reads
 * survive — styling (className, style) is presentation and is dropped.
 */

type HostProps = {
  children?: ReactNode
  testID?: string
  accessibilityRole?: string
  accessibilityLabel?: string
  [key: string]: unknown
}

function host(tag: string) {
  return function Host({ children, testID, accessibilityRole, accessibilityLabel }: HostProps) {
    return createElement(
      tag,
      {
        "data-testid": testID,
        "data-role": accessibilityRole,
        "aria-label": accessibilityLabel,
      },
      children
    )
  }
}

export const View = host("div")
export const Text = host("span")
export const Pressable = host("div")

export const StyleSheet = {
  flatten(style: unknown): Record<string, unknown> {
    if (!Array.isArray(style)) return (style as Record<string, unknown>) ?? {}
    return Object.assign({}, ...style.map((s) => StyleSheet.flatten(s)))
  },
}
