import { StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { StudioScreen } from "@/studio/studio-screen"
import { ThemedView } from "@/components/themed-view"

export default function StudioRoute() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <StudioScreen />
      </SafeAreaView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
})
