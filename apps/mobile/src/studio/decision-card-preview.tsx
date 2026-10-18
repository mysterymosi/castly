import { CARD_WIDTH } from "@workspace/portfolio-native"
import type { CardConfig } from "@workspace/schema"
import { StyleSheet, Text, View } from "react-native"

type Props = {
  displayName: string
  headline?: string | null
  cardConfig: CardConfig
}

export function DecisionCardPreview({ displayName, headline, cardConfig }: Props) {
  const facts = cardConfig.highlightFacts.filter(Boolean).slice(0, 3)
  while (facts.length < 3) facts.push("Add a highlight fact")

  return (
    <View style={styles.card}>
      <View style={styles.leadMedia} />
      <Text style={styles.name}>{displayName}</Text>
      {headline ? <Text style={styles.headline}>{headline}</Text> : null}
      {facts.map((fact, index) => (
        <Text key={`${index}-${fact}`} style={styles.fact} numberOfLines={1}>
          • {fact}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    maxWidth: "100%",
    alignSelf: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fafafa",
    overflow: "hidden",
  },
  leadMedia: {
    width: "100%",
    height: CARD_WIDTH * 0.55,
    borderRadius: 8,
    backgroundColor: "#e5e5e5",
    marginBottom: 12,
  },
  name: { fontSize: 20, fontWeight: "700" },
  headline: { fontSize: 14, color: "#525252", marginTop: 4, marginBottom: 8 },
  fact: { fontSize: 13, color: "#404040", marginTop: 4 },
})
