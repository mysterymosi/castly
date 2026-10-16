import { useEffect, useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import type { Me } from "@workspace/schema"

import { authApi } from "@/auth/client"
import { clearSession, currentUser, saveSession } from "@/auth/session"

type Step = "email" | "code"

export function SignInScreen() {
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    currentUser()
      .then(setMe)
      .finally(() => setReady(true))
  }, [])

  async function requestCode() {
    setPending(true)
    setError(null)
    try {
      await authApi.requestOtp({ email, dateOfBirth })
      setStep("code")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send a code")
    } finally {
      setPending(false)
    }
  }

  async function verifyCode() {
    setPending(true)
    setError(null)
    try {
      const session = await authApi.verifyOtp({ email, dateOfBirth, token: code })
      await saveSession(session)
      setMe(await authApi.me())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That code was not accepted")
    } finally {
      setPending(false)
    }
  }

  async function enable(mode: "talent" | "booker") {
    setError(null)
    try {
      await authApi.enableMode(mode)
      setMe(await authApi.me())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enable that mode")
    }
  }

  async function signOut() {
    await clearSession()
    setMe(null)
    setStep("email")
    setCode("")
  }

  if (!ready) return <ActivityIndicator style={styles.loader} />

  if (me) {
    return (
      <View style={styles.form}>
        <Text style={styles.title}>Signed in</Text>
        <Text style={styles.body}>{me.email}</Text>
        <Text style={styles.body}>Modes: {me.modes.length > 0 ? me.modes.join(", ") : "none yet"}</Text>
        <Pressable style={styles.button} onPress={() => enable("talent")}>
          <Text style={styles.buttonText}>Enable talent</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => enable("booker")}>
          <Text style={styles.buttonText}>Enable booker</Text>
        </Pressable>
        <Pressable onPress={signOut}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    )
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title}>Castly</Text>
      <Text style={styles.body}>Sign in with your email. You need to be 18 or older.</Text>
      {step === "email" ? (
        <>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            autoComplete="birthdate-full"
            placeholder="Date of birth YYYY-MM-DD"
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
          />
          <Pressable style={styles.button} disabled={pending} onPress={requestCode}>
            <Text style={styles.buttonText}>{pending ? "Sending…" : "Send code"}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder="6-digit code"
            value={code}
            onChangeText={setCode}
          />
          <Pressable style={styles.button} disabled={pending} onPress={verifyCode}>
            <Text style={styles.buttonText}>{pending ? "Checking…" : "Verify"}</Text>
          </Pressable>
          <Pressable onPress={() => setStep("email")}>
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  loader: { marginTop: 48 },
  form: { alignSelf: "stretch", gap: 12, paddingVertical: 24 },
  title: { fontSize: 32, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    fontSize: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  link: { fontSize: 16, textDecorationLine: "underline" },
  error: { color: "#b91c1c", fontSize: 15 },
})
