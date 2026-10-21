export const palette = {
  ink: "#0E0F13",
  inkSurface: "#17181D",
  inkSurfaceMuted: "#22242B",
  inkBorder: "#2A2C33",
  inkBorderStrong: "#6B6F79",
  ivory: "#F7F3EC",
  paper: "#FFFFFF",
  sand: "#EFE9DF",
  sandBorder: "#E3DCCF",
  sandBorderStrong: "#8C857A",
  muted: "#8A8F98",
  mutedOnLight: "#5C6169",
  gold: "#F5B83D",
  goldPressed: "#D99A1E",
  goldDeep: "#8A5A00",
  teal: "#2BB3A3",
  tealDeep: "#127066",
  coral: "#E5604D",
  coralDeep: "#B23A28",
} as const

export type ColorScheme = "light" | "dark"

export type ColorRole =
  | "bg"
  | "surface"
  | "surfaceMuted"
  | "border"
  | "borderStrong"
  | "text"
  | "textMuted"
  | "accent"
  | "accentPressed"
  | "onAccent"
  | "accentText"
  | "interested"
  | "onInterested"
  | "interestedText"
  | "pass"
  | "onPass"
  | "passText"
  | "focus"
  | "inverse"
  | "onInverse"

export const colors: Record<ColorScheme, Record<ColorRole, string>> = {
  light: {
    bg: palette.ivory,
    surface: palette.paper,
    surfaceMuted: palette.sand,
    border: palette.sandBorder,
    borderStrong: palette.sandBorderStrong,
    text: palette.ink,
    textMuted: palette.mutedOnLight,
    accent: palette.gold,
    accentPressed: palette.goldPressed,
    onAccent: palette.ink,
    accentText: palette.goldDeep,
    interested: palette.teal,
    onInterested: palette.ink,
    interestedText: palette.tealDeep,
    pass: palette.coral,
    onPass: palette.ink,
    passText: palette.coralDeep,
    focus: palette.goldDeep,
    inverse: palette.ink,
    onInverse: palette.ivory,
  },
  dark: {
    bg: palette.ink,
    surface: palette.inkSurface,
    surfaceMuted: palette.inkSurfaceMuted,
    border: palette.inkBorder,
    borderStrong: palette.inkBorderStrong,
    text: palette.ivory,
    textMuted: palette.muted,
    accent: palette.gold,
    accentPressed: palette.goldPressed,
    onAccent: palette.ink,
    accentText: palette.gold,
    interested: palette.teal,
    onInterested: palette.ink,
    interestedText: palette.teal,
    pass: palette.coral,
    onPass: palette.ink,
    passText: palette.coral,
    focus: palette.gold,
    inverse: palette.ivory,
    onInverse: palette.ink,
  },
}

/** Text/background pairs the UI is allowed to use. `large` pairs only need 3:1 (text >= 18.66px bold or 24px, and non-text UI). */
export const contrastPairs: ReadonlyArray<{
  fg: ColorRole
  bg: ColorRole
  large?: boolean
}> = [
  { fg: "text", bg: "bg" },
  { fg: "text", bg: "surface" },
  { fg: "text", bg: "surfaceMuted" },
  { fg: "textMuted", bg: "bg" },
  { fg: "textMuted", bg: "surface" },
  { fg: "textMuted", bg: "surfaceMuted" },
  { fg: "onAccent", bg: "accent" },
  { fg: "onAccent", bg: "accentPressed" },
  { fg: "onInterested", bg: "interested" },
  { fg: "onPass", bg: "pass" },
  { fg: "onInverse", bg: "inverse" },
  { fg: "accentText", bg: "bg" },
  { fg: "accentText", bg: "surface" },
  { fg: "interestedText", bg: "bg" },
  { fg: "interestedText", bg: "surface" },
  { fg: "passText", bg: "bg" },
  { fg: "passText", bg: "surface" },
  { fg: "borderStrong", bg: "bg", large: true },
  { fg: "borderStrong", bg: "surface", large: true },
  { fg: "focus", bg: "bg", large: true },
  { fg: "focus", bg: "surface", large: true },
]

function channel(value: number) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** "#RRGGBB" -> "R G B", for `rgb(var(--x) / <alpha-value>)` CSS variables. */
export function hexToRgbChannels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ")
}

/** Font family names as registered with expo-font (one family per weight on native). */
export const fontFamily = {
  heading: "PlusJakartaSans_700Bold",
  headingSemibold: "PlusJakartaSans_600SemiBold",
  body: "PlusJakartaSans_400Regular",
  bodyMedium: "PlusJakartaSans_500Medium",
  bodySemibold: "PlusJakartaSans_600SemiBold",
} as const

/** [fontSize, lineHeight] in px. */
export const fontSize = {
  caption: [12, 16],
  footnote: [13, 18],
  "body-sm": [15, 22],
  body: [16, 24],
  "title-sm": [18, 24],
  title: [22, 28],
  "display-sm": [28, 34],
  display: [34, 40],
} as const satisfies Record<string, readonly [number, number]>

/** 4pt grid, in px. */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  28: 112,
  32: 128,
} as const

export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const

export const shadow = {
  card: "0px 2px 12px rgba(14, 15, 19, 0.06)",
  raised: "0px 8px 24px rgba(14, 15, 19, 0.14)",
} as const

export const motion = {
  fast: 120,
  base: 220,
  slow: 320,
  pressScale: 0.97,
} as const

export const size = {
  minTouch: 44,
  icon: 24,
  iconSm: 18,
} as const

export const tokens = {
  palette,
  colors,
  fontFamily,
  fontSize,
  spacing,
  radius,
  shadow,
  motion,
  size,
} as const
