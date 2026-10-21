import { palette, shadow } from "@workspace/ui-tokens"
import { router } from "expo-router"
import { Pressable, View } from "react-native"
import { FadeIn, FadeInDown } from "react-native-reanimated"

import { Logo } from "@/components/brand/logo"
import { AnimatedView } from "@/components/ui/animated"
import { Button } from "@/components/ui/button"
import { Screen } from "@/components/ui/screen"
import { Text } from "@/components/ui/text"

export default function WelcomeScreen() {
  return (
    <Screen
      footer={
        <AnimatedView entering={FadeIn.delay(240).duration(320)} className="pb-2">
          <Button
            label="Create an account"
            variant="inverse"
            onPress={() => router.push({ pathname: "/email", params: { mode: "signup" } })}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/email", params: { mode: "signin" } })}
            className="mt-2 min-h-11 items-center justify-center active:opacity-60"
          >
            <Text variant="body-strong">I have an account</Text>
          </Pressable>
          <Text variant="footnote" tone="muted" className="mt-8 text-center">
            You need to be 18 or older to use Castly.
          </Text>
        </AnimatedView>
      }
    >
      <View className="flex-1 items-center justify-center gap-6">
        <AnimatedView
          entering={FadeInDown.duration(420)}
          className="h-28 w-28 items-center justify-center rounded-xl dark:border dark:border-border"
          style={{ backgroundColor: palette.ink, boxShadow: shadow.raised }}
        >
          <Logo variant="mark" size={72} color={palette.gold} />
        </AnimatedView>
        <AnimatedView entering={FadeInDown.delay(80).duration(420)} className="items-center gap-3">
          <Logo variant="wordmark" size={40} />
          <Text variant="body" tone="muted" className="text-center" style={{ maxWidth: 300 }}>
            Portfolios for actors, models and creatives, built for casting.
          </Text>
        </AnimatedView>
      </View>
    </Screen>
  )
}
