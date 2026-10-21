import type { ComponentType, ReactNode } from "react"

type StubProps = { children?: ReactNode; style?: unknown; [key: string]: unknown }

export const View: ComponentType<StubProps> = () => null
export const Text: ComponentType<StubProps> = () => null

export const StyleSheet = {
  flatten(style: unknown): Record<string, unknown> {
    if (!Array.isArray(style)) return (style as Record<string, unknown>) ?? {}
    return Object.assign({}, ...style.map((s) => StyleSheet.flatten(s)))
  },
}
