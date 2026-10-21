import { Text as RNText, type TextProps as RNTextProps } from "react-native"

import { cn } from "@/lib/cn"

const variants = {
  display: "font-heading text-display",
  "display-sm": "font-heading text-display-sm",
  title: "font-heading text-title",
  "title-sm": "font-headingSemibold text-title-sm",
  body: "font-body text-body",
  "body-strong": "font-bodySemibold text-body",
  "body-sm": "font-body text-body-sm",
  label: "font-bodySemibold text-body-sm",
  footnote: "font-body text-footnote",
  caption: "font-bodySemibold text-caption uppercase tracking-wider",
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
