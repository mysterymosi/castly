import { dateOfBirthSchema, emailSchema } from "@workspace/schema"
import { router, useLocalSearchParams } from "expo-router"
import { useRef, useState } from "react"
import { TextInput, View } from "react-native"
import { FadeInRight, FadeOutLeft } from "react-native-reanimated"

import { authApi } from "@/auth/client"
import { errorMessage, useSession } from "@/auth/session-provider"
import { AnimatedView } from "@/components/ui/animated"
import { NextBar } from "@/components/ui/next-bar"
import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { haptics } from "@/lib/haptics"

type Step = "email" | "dob"
type AuthMode = "signup" | "signin"

/** Formats raw digits as YYYY-MM-DD while typing. */
function formatDateOfBirth(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

function dobProblem(value: string) {
  if (!dateOfBirthSchema.safeParse(value).success) return "Use the format YYYY-MM-DD"
  const [, month, day] = value.split("-").map(Number)
  if (!month || month > 12 || !day || day > 31) return "That date doesn't look right"
  return null
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function authMode(value: string | string[] | undefined): AuthMode {
  const mode = firstParam(value)
  return mode === "signin" ? "signin" : "signup"
}

export default function EmailScreen() {
  const params = useLocalSearchParams<{ mode?: string; email?: string }>()
  const mode = authMode(params.mode)
  const signingIn = mode === "signin"
  const { draft, setDraft } = useSession()
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState(firstParam(params.email) || draft.email)
  const [dateOfBirth, setDateOfBirth] = useState(draft.dateOfBirth ?? "")
  const [touched, setTouched] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dobRef = useRef<TextInput>(null)

  const emailValid = emailSchema.safeParse(email).success
  const dobError = dateOfBirth.length === 10 ? dobProblem(dateOfBirth) : null
  const dobValid = dateOfBirth.length === 10 && !dobError
  const showDob = !signingIn && step === "dob"

  function back() {
    setError(null)
    if (showDob) setStep("email")
    else router.back()
  }

  function nextFromEmail() {
    setTouched(true)
    if (!emailValid) return
    setStep("dob")
    setTouched(false)
    setTimeout(() => dobRef.current?.focus(), 250)
  }

  async function requestCode() {
    if (pending) return
    setTouched(true)
    if (signingIn) {
      if (!emailValid) return
    } else if (!dobValid) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const normalized = email.trim().toLowerCase()
      if (signingIn) {
        await authApi.requestOtp({ email: normalized })
        setDraft({ email: normalized })
      } else {
        await authApi.requestOtp({ email: normalized, dateOfBirth })
        setDraft({ email: normalized, dateOfBirth })
      }
      haptics.success()
      router.push("/verify")
    } catch (caught) {
      haptics.error()
      setError(errorMessage(caught, "Could not send a code"))
    } finally {
      setPending(false)
    }
  }

  function onEmailSubmit() {
    if (signingIn) void requestCode()
    else nextFromEmail()
  }

  return (
    <Screen
      scroll
      header={<ScreenHeader onBack={back} />}
      footer={
        showDob ? (
          <NextBar
            onNext={requestCode}
            disabled={!dobValid}
            loading={pending}
            label="Send code"
            note="Next, we'll email you a sign-in code."
            noteIcon="mail"
          />
        ) : (
          <NextBar
            onNext={onEmailSubmit}
            disabled={!emailValid}
            loading={signingIn && pending}
            label={signingIn ? "Send code" : "Continue"}
            note={signingIn ? "Next, we'll email you a sign-in code." : "No password needed."}
            noteIcon={signingIn ? "mail" : "lock"}
          />
        )
      }
    >
      {showDob ? (
        <AnimatedView key="dob" entering={FadeInRight.duration(220)} exiting={FadeOutLeft.duration(160)} className="gap-6 pt-6">
          <View className="gap-2">
            <Text variant="display-sm">When’s your birthday?</Text>
            <Text variant="body" tone="muted">
              Castly is for adults, so we need to confirm you’re 18 or older.
            </Text>
          </View>
          <TextField
            ref={dobRef}
            label="Date of birth"
            hint="Year, month, day — for example 1994-05-12"
            value={dateOfBirth}
            onChangeText={(next) => {
              setDateOfBirth(formatDateOfBirth(next))
              setError(null)
            }}
            placeholder="YYYY-MM-DD"
            autoComplete="birthdate-full"
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={10}
            returnKeyType="send"
            onSubmitEditing={requestCode}
            error={dobError ?? (touched && !dobValid ? "Enter your full date of birth" : null)}
          />
          {error ? <InlineError message={error} /> : null}
        </AnimatedView>
      ) : (
        <AnimatedView key="email" entering={FadeInRight.duration(220)} exiting={FadeOutLeft.duration(160)} className="gap-6 pt-6">
          <View className="gap-2">
            <Text variant="display-sm">What’s your email?</Text>
            <Text variant="body" tone="muted">
              Use the address you want bookers and Castly to reach you on.
            </Text>
          </View>
          <TextField
            label="Email"
            value={email}
            onChangeText={(next) => {
              setEmail(next)
              setError(null)
            }}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            autoFocus
            inputMode="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType={signingIn ? "send" : "next"}
            onSubmitEditing={onEmailSubmit}
            error={touched && !emailValid ? "Enter a valid email address" : null}
          />
          {error ? <InlineError message={error} /> : null}
        </AnimatedView>
      )}
    </Screen>
  )
}
