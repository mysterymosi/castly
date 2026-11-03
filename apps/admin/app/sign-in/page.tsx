import type { Metadata } from "next"

import { SignInForm } from "./sign-in-form"

export const metadata: Metadata = { title: "Sign in · Castly ops" }

const notices: Record<string, string> = {
  "not-admin": "That account doesn't have ops access.",
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { reason } = await searchParams
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-xs flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium">Castly ops</h1>
          <p className="text-xs text-muted-foreground">Sign in with your Castly account&apos;s email.</p>
        </div>
        <SignInForm notice={typeof reason === "string" ? (notices[reason] ?? null) : null} />
      </div>
    </main>
  )
}
