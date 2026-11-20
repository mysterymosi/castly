import { View } from "react-native"

import { Text, type TextTone } from "@/components/ui/text"
import { cn } from "@/lib/cn"

/** Tinted backgrounds with the text tone that reads on each; picked by name so a person keeps theirs. */
const tints = [
  { bg: "bg-accent/20", tone: "accent" },
  { bg: "bg-interested/20", tone: "interested" },
  { bg: "bg-pass/15", tone: "pass" },
  { bg: "bg-surfaceMuted", tone: "default" },
] as const satisfies readonly { bg: string; tone: TextTone }[]

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : (words[0] ?? "?").slice(0, 1)
  return letters.toUpperCase()
}

function tintFor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return tints[Math.abs(hash) % tints.length]!
}

/** A person or company as initials on a tinted circle, with an optional "here now" dot. */
export function Avatar({ name, size = 52, present = false }: { name: string; size?: number; present?: boolean }) {
  const tint = tintFor(name)
  const dot = Math.max(10, Math.round(size * 0.26))
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View
        className={cn("items-center justify-center rounded-pill", tint.bg)}
        style={{ width: size, height: size }}
      >
        <Text variant={size >= 48 ? "title-sm" : "label"} tone={tint.tone} maxFontSizeMultiplier={1.2}>
          {initials(name)}
        </Text>
      </View>
      {present ? (
        <View
          className="absolute rounded-pill border-2 border-bg bg-interested"
          style={{ width: dot, height: dot, right: 0, bottom: 0 }}
        />
      ) : null}
    </View>
  )
}
