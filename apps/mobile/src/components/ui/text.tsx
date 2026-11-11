import { Text as RNText, type TextProps as RNTextProps } from "react-native"

import { cn } from "@/lib/cn"

/** Weighted a step heavier than the type scale's defaults: light text read thin on device. */
const variants = {
  display: "font-display text-display tracking-tight",
  "display-sm": "font-display text-display-sm tracking-tight",
  title: "font-heading text-title",
  "title-sm": "font-heading text-title-sm",
  body: "font-bodyMedium text-body",
  "body-strong": "font-bodyBold text-body",
  "body-sm": "font-bodyMedium text-body-sm",
  label: "font-bodyBold text-body-sm",
  footnote: "font-bodyMedium text-footnote",
  caption: "font-bodyBold text-caption uppercase tracking-wider",
} as const

const tones = {
  default: "text-text",
  muted: "text-textMuted",
  accent: "text-accentText",
  interested: "text-interestedText",
  pass: "text-passText",
  onAccent: "text-onAccent",
  onInverse: "text-onInverse",
  onPass: "text-onPass",
  onInterested: "text-onInterested",
} as const

export type TextVariant = keyof typeof variants
export type TextTone = keyof typeof tones

export type TextProps = RNTextProps & {
  variant?: TextVariant
  tone?: TextTone
  className?: string
}

export function Text({ variant = "body", tone = "default", className, ...rest }: TextProps) {
  const heading = variant === "display" || variant === "display-sm" || variant === "title"
  const large = variant === "display" || variant === "display-sm"
  return (
    <RNText
      accessibilityRole={heading ? "header" : rest.accessibilityRole}
      maxFontSizeMultiplier={large ? 1.5 : 2}
      className={cn(variants[variant], tones[tone], className)}
      {...rest}
    />
  )
}
