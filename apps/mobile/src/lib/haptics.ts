import * as Haptics from "expo-haptics"
import { Platform } from "react-native"

const enabled = Platform.OS === "ios" || Platform.OS === "android"

export const haptics = {
  selection() {
    if (enabled) void Haptics.selectionAsync().catch(() => {})
  },
  tap() {
    if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  },
  success() {
    if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  },
  error() {
    if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
  },
}
