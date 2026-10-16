import { StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { SignInScreen } from "@/auth/sign-in-screen"
import { ThemedView } from "@/components/themed-view"
import { Spacing } from "@/constants/theme"

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <SignInScreen />
      </SafeAreaView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
})
