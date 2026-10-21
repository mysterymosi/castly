import { cssInterop } from "nativewind"
import Animated from "react-native-reanimated"

cssInterop(Animated.View, { className: "style" })
cssInterop(Animated.Text, { className: "style" })

export const AnimatedView = Animated.View
export const AnimatedText = Animated.Text
