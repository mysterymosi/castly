import type { ComponentType, ReactNode } from "react"

type StubProps = { children?: ReactNode; style?: unknown; [key: string]: unknown }

export const View: ComponentType<StubProps> = () => null
export const Text: ComponentType<StubProps> = () => null

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T): T {
    return styles
  },
}
