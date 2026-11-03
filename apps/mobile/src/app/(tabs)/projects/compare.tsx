import { useQuery } from "@tanstack/react-query"
import { shortlistCompareSchema, type DeckCard } from "@workspace/schema"
import { Image } from "expo-image"
import { router, useLocalSearchParams } from "expo-router"
import { ScrollView, View } from "react-native"

import { errorMessage } from "@/auth/session-provider"
import { Icon } from "@/components/ui/icon"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { mediaUri } from "@/deck/deck-card"
import { trpcQuery } from "@/trpc/query-client"

const LABEL_WIDTH = 104
const COLUMN_WIDTH = 148
const NONE = "—"

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)

function photo(card: DeckCard) {
  const lead = card.decision.leadMediaIds[0]
  return lead ? mediaUri(card, lead) : null
}

function dayRate(card: DeckCard) {
  const day = card.talent.rates?.find((r) => r.kind === "day")
  if (!day) return card.talent.profile.rateVisibility === "public" ? NONE : "On request"
  const parts = [day.amountMin, day.amountMax].filter((n): n is number => n !== null)
  return parts.length ? parts.map((n) => money(n, day.currency)).join(" – ") : "On request"
}

/**
 * Rows for the comparison: identity first, then each attribute any of the talents shows (height,
 * playing age, hair and the like — visible, standard tier only, as serialization allows), then
 * languages, skills and credits. Every value is what this booker may see.
 */
function rows(cards: DeckCard[]): { label: string; values: string[] }[] {
  const list = (items: { name: string }[]) => (items.length ? items.map((i) => i.name).join(", ") : NONE)
  const attributeLabels = [...new Set(cards.flatMap((c) => c.talent.content.attributes.map((a) => a.label)))]
  return [
    { label: "Category", values: cards.map((c) => c.decision.categoryName ?? NONE) },
    { label: "City", values: cards.map((c) => c.talent.profile.cityName ?? NONE) },
    ...attributeLabels.map((label) => ({
      label,
      values: cards.map((c) => c.talent.content.attributes.find((a) => a.label === label)?.value ?? NONE),
    })),
    { label: "Languages", values: cards.map((c) => list(c.talent.content.languages)) },
    { label: "Accents", values: cards.map((c) => list(c.talent.content.accents)) },
    { label: "Skills", values: cards.map((c) => list(c.talent.content.skills)) },
    { label: "Credits", values: cards.map((c) => String(c.decision.creditCount)) },
    {
      label: "Signature credit",
      values: cards.map((c) => {
        const s = c.decision.signatureCredit
        if (!s) return NONE
        return [s.title, s.roleName, s.year].filter(Boolean).join(" · ")
      }),
    },
    { label: "Day rate", values: cards.map(dayRate) },
  ]
}

/** Shortlisted talents side by side on their key attributes (PRD §7.2.2). */
export default function CompareScreen() {
  const params = useLocalSearchParams<{ shortlistId: string; talentIds: string }>()
  const talentIds = (params.talentIds ?? "").split(",").filter(Boolean)
  const compareQuery = useQuery(
    trpcQuery.shortlist.compare.queryOptions(
      { shortlistId: params.shortlistId, talentIds },
      { select: shortlistCompareSchema.parse },
    ),
  )

  const header = <ScreenHeader title="Compare" onBack={() => router.back()} />
  if (!compareQuery.data && compareQuery.error) {
    return (
      <Screen edges={["top"]} header={header} contentClassName="justify-center">
        <ErrorState
          message={errorMessage(compareQuery.error, "Could not compare these talents")}
          onRetry={() => void compareQuery.refetch()}
        />
      </Screen>
    )
  }
  if (!compareQuery.data) return <LoadingState label="Comparing" />
  const cards = compareQuery.data.talents

  return (
    <Screen scroll edges={["top", "bottom"]} header={header} contentClassName="pt-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
        <View>
          <View className="flex-row pb-4">
            <View style={{ width: LABEL_WIDTH }} />
            {cards.map((card) => {
              const uri = photo(card)
              return (
                <View key={card.talent.profile.userId} style={{ width: COLUMN_WIDTH }} className="gap-2 pr-3">
                  <View className="overflow-hidden rounded-lg bg-surfaceMuted" style={{ height: COLUMN_WIDTH * 1.25 }}>
                    {uri ? (
                      <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" />
                    ) : (
                      <View className="flex-1 items-center justify-center">
                        <Icon name="person" size={28} tone="textMuted" />
                      </View>
                    )}
                  </View>
                  <Text variant="body-strong" numberOfLines={2}>
                    {card.talent.profile.displayName}
                  </Text>
                </View>
              )
            })}
          </View>
          {rows(cards).map((row) => (
            <View
              key={row.label}
              className="flex-row border-t border-border py-3"
              accessible
              accessibilityLabel={`${row.label}: ${cards
                .map((c, i) => `${c.talent.profile.displayName} ${row.values[i]}`)
                .join("; ")}`}
            >
              <Text variant="footnote" tone="muted" style={{ width: LABEL_WIDTH }} className="pr-2">
                {row.label}
              </Text>
              {row.values.map((value, i) => (
                <Text key={cards[i]!.talent.profile.userId} variant="body-sm" style={{ width: COLUMN_WIDTH }} className="pr-3">
                  {value}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  )
}
