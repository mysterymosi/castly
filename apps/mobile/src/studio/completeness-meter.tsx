import type { StudioState } from "@workspace/schema"
import { StyleSheet, Text, View } from "react-native"

type Props = {
  completeness: StudioState["completeness"]
}

export function CompletenessMeter({ completeness }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${completeness.score}%` }]} />
      </View>
      <Text style={styles.label}>
        Completeness {completeness.score}%{" "}
        {completeness.quickStartMet ? "· Quick start done" : "· Finish quick start to publish"}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 12 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e5e5e5",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: "#16a34a",
  },
  label: { fontSize: 12, color: "#525252", marginTop: 6 },
})
