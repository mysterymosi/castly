import { CARD_WIDTH } from "@workspace/portfolio-native"
import type { CardConfig } from "@workspace/schema"
import { shadow } from "@workspace/ui-tokens"
import { View } from "react-native"

import { Tag } from "@/components/ui/chip"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"

type Props = {
  displayName: string
  headline?: string | null
  cardConfig: CardConfig
  /** Thumbnail rendering for the studio hub: media + name only. */
  compact?: boolean
}

function DecisionButton({ kind }: { kind: "pass" | "interested" }) {
  const pass = kind === "pass"
  return (
    <View
      className="items-center gap-1.5"
      accessible
      accessibilityRole="button"
      accessibilityLabel={pass ? "Pass" : "Interested"}
      accessibilityState={{ disabled: true }}
      accessibilityHint="Bookers use this on your card. Disabled in preview."
    >
      <View
        className={
          pass
            ? "h-14 w-14 items-center justify-center rounded-pill border-2 border-passText bg-surface"
            : "h-14 w-14 items-center justify-center rounded-pill bg-interested"
        }
      >
        <Icon name={pass ? "close" : "check"} size={24} tone={pass ? "passText" : "onInterested"} />
      </View>
      <Text variant="footnote" tone="muted">
        {pass ? "Pass" : "Interested"}
      </Text>
    </View>
  )
}

export function DecisionCardPreview({ displayName, headline, cardConfig, compact = false }: Props) {
  const facts = cardConfig.highlightFacts.map((fact) => fact.trim()).filter(Boolean).slice(0, 3)
  const missing = 3 - facts.length

  if (compact) {
    return (
      <View className="flex-1 justify-end bg-surfaceMuted">
        <View className="absolute inset-0 items-center justify-center">
          <Icon name="person" size={32} tone="textMuted" />
        </View>
        <View className="bg-inverse/85 px-2 py-1.5">
          <Text variant="footnote" tone="onInverse" numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {displayName}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View
      className="self-center overflow-hidden rounded-xl border border-border bg-surface"
      style={{ width: CARD_WIDTH, maxWidth: "100%", boxShadow: shadow.raised }}
    >
      <View className="justify-end bg-surfaceMuted" style={{ aspectRatio: 4 / 5 }}>
        <View className="absolute inset-0 items-center justify-center gap-2">
          <Icon name="photo" size={36} tone="textMuted" />
          <Text variant="footnote" tone="muted">
            {cardConfig.leadMediaId ? "Lead photo" : "Lead photo appears here"}
          </Text>
        </View>
        <View className="gap-3 bg-inverse/85 p-4">
          <View className="gap-0.5">
            <Text variant="title" tone="onInverse" numberOfLines={1}>
              {displayName}
            </Text>
            {headline ? (
              <Text variant="body-sm" tone="onInverse" numberOfLines={2} className="opacity-80">
                {headline}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View className="gap-2 p-4">
        <Text variant="caption" tone="muted">
          Highlights
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {facts.map((fact, index) => (
            <Tag key={`${index}-${fact}`} label={fact} />
          ))}
          {missing > 0 ? (
            <View className="min-h-8 flex-row items-center gap-1.5 self-start rounded-pill border border-dashed border-borderStrong px-3 py-1">
              <Icon name="plus" size={12} tone="textMuted" />
              <Text variant="footnote" tone="muted">
                {missing === 3 ? "Add up to 3 highlights" : `${missing} more highlight${missing > 1 ? "s" : ""}`}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className="flex-row justify-center gap-12 border-t border-border pb-4 pt-3">
        <DecisionButton kind="pass" />
        <DecisionButton kind="interested" />
      </View>
    </View>
  )
}
