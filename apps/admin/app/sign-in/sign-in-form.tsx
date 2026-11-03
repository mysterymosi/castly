"use client"

import { Button } from "@workspace/ui/components/button"
import { useActionState } from "react"

import { ErrorNote, Field } from "@/components/field"

import { signIn, type SignInState } from "./actions"

const initial: SignInState = { step: "email", email: "", error: null }

export function SignInForm({ notice }: { notice: string | null }) {
  const [state, action, pending] = useActionState(signIn, initial)
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <ErrorNote>{state.error}</ErrorNote> : notice ? <ErrorNote>{notice}</ErrorNote> : null}
      {state.step === "email" ? (
        <Field label="Email" name="email" type="email" autoComplete="email" required autoFocus />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">If {state.email} has an account, a code is on its way.</p>
          <Field
            key="code"
            label="Code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
          />
        </>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Checking…" : state.step === "email" ? "Send code" : "Sign in"}
      </Button>
    </form>
  )
}
