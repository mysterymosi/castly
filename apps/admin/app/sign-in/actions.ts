"use server"

import { requestOtpInput, verifyOtpInput } from "@workspace/schema"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { apiAs, errorMessage, publicApi } from "@/lib/api"
import { ACCESS_COOKIE, EXPIRES_COOKIE, REFRESH_COOKIE, sessionCookies } from "@/lib/session-cookies"

export type SignInState = { step: "email" | "code"; email: string; error: string | null }

/**
 * Two steps on one form: send a code to an existing account's email, then verify it. The API
 * never says whether an email has an account, so an unknown email also moves on to the code step.
 * Only an account with the admin mode gets session cookies.
 */
export async function signIn(state: SignInState, formData: FormData): Promise<SignInState> {
  if (state.step === "email") {
    const parsed = requestOtpInput.safeParse({ email: formData.get("email") })
    if (!parsed.success) return { ...state, error: "Enter a valid email address" }
    try {
      await publicApi.auth.requestOtp.mutate({ email: parsed.data.email })
    } catch (error) {
      return { ...state, error: errorMessage(error, "Could not send a code") }
    }
    return { step: "code", email: parsed.data.email, error: null }
  }

  const parsed = verifyOtpInput.safeParse({ email: state.email, token: formData.get("code") })
  if (!parsed.success) return { ...state, error: "Enter the code from the email" }
  let session
  try {
    session = await publicApi.auth.verifyOtp.mutate({ email: parsed.data.email, token: parsed.data.token })
  } catch (error) {
    return { ...state, error: errorMessage(error, "Could not verify that code") }
  }
  const me = await apiAs(session.accessToken).auth.me.query()
  if (!me.modes.includes("admin")) return { step: "email", email: "", error: "This account isn't an ops admin." }

  const store = await cookies()
  for (const { name, value, options } of sessionCookies(session)) store.set(name, value, options)
  redirect("/")
}

export async function signOut() {
  const store = await cookies()
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, EXPIRES_COOKIE]) store.delete(name)
  redirect("/sign-in")
}
