import { Redirect, router } from "expo-router"
import { useRef, useState } from "react"
import { Pressable, TextInput, View } from "react-native"

import { authApi } from "@/auth/client"
import { errorMessage, useSession } from "@/auth/session-provider"
import { NextBar } from "@/components/ui/next-bar"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { cn } from "@/lib/cn"
import { haptics } from "@/lib/haptics"

const CODE_LENGTH = 6

export default function VerifyScreen() {
  const { draft, signIn } = useSession()
  const { color } = useTokens()
  const [code, setCode] = useState("")
  const [focused, setFocused] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<TextInput>(null)

  if (!draft.email) return <Redirect href="/email" />

  const signingIn = !draft.dateOfBirth

  async function verify(token = code) {
    if (token.length !== CODE_LENGTH || pending) return
    setPending(true)
    setError(null)
    try {
      const session = await authApi.verifyOtp({
        email: draft.email,
        token,
        ...(draft.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}),
      })
      haptics.success()
      await signIn(session)
    } catch (caught) {
      haptics.error()
      setError(errorMessage(caught, "That code is invalid or has expired."))
      setCode("")
      inputRef.current?.focus()
    } finally {
      setPending(false)
    }
  }

  function onChange(next: string) {
    const digits = next.replace(/\D/g, "").slice(0, CODE_LENGTH)
    setCode(digits)
    setError(null)
    if (digits.length === CODE_LENGTH) void verify(digits)
  }

  const activeIndex = Math.min(code.length, CODE_LENGTH - 1)

  return (
    <Screen
      scroll
      header={<ScreenHeader onBack={() => router.back()} />}
      footer={
        <NextBar
          onNext={() => verify()}
          disabled={code.length !== CODE_LENGTH}
          loading={pending}
          label="Verify code"
          note="Can't find it? Check your spam folder."
          noteIcon="mail"
        />
      }
    >
      <View className="gap-6 pt-6">
        <View className="gap-2">
          <Text variant="display-sm">Enter your code</Text>
          {signingIn ? (
            <Text variant="body" tone="muted">
              If there’s a Castly account for <Text variant="body-strong">{draft.email}</Text>, we’ve sent a 6-digit code.
            </Text>
          ) : (
            <Text variant="body" tone="muted">
              We sent a 6-digit code to <Text variant="body-strong">{draft.email}</Text>
            </Text>
          )}
        </View>

        <Pressable
          accessible={false}
          onPress={() => inputRef.current?.focus()}
          className="relative flex-row justify-between gap-2"
        >
          {Array.from({ length: CODE_LENGTH }, (_, index) => {
            const digit = code[index]
            const isActive = focused && index === activeIndex && !pending
            return (
              <View
                key={index}
                importantForAccessibility="no-hide-descendants"
                className={cn(
                  "h-16 flex-1 items-center justify-center rounded-lg border-2 bg-surface",
                  error ? "border-passText" : isActive ? "border-focus" : digit ? "border-text" : "border-borderStrong",
                )}
              >
                <Text variant="title" maxFontSizeMultiplier={1.4}>
                  {digit ?? ""}
                </Text>
              </View>
            )
          })}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            accessibilityLabel="Six-digit verification code"
            accessibilityHint={`Sent to ${draft.email}`}
            caretHidden
            selectionColor={color.focus}
            className="absolute inset-0 text-transparent opacity-0"
          />
        </Pressable>

        {error ? <InlineError message={error} /> : null}

        <View className="gap-1">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            className="min-h-11 self-start justify-center active:opacity-60"
          >
            <Text variant="label" tone="accent" className="underline">
              Use a different email
            </Text>
          </Pressable>
          {signingIn ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/email",
                  params: { mode: "signup", email: draft.email },
                })
              }
              className="min-h-11 self-start justify-center active:opacity-60"
            >
              <Text variant="label" tone="accent" className="underline">
                No account yet? Create one
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Screen>
  )
}
