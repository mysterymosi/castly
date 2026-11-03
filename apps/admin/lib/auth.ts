import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"

import { adminCall } from "@/lib/api"

/**
 * The signed-in admin, checked against the API once per request. Anyone else goes to sign-in.
 * Pages call this for the real check; `proxy.ts` only does the optimistic cookie check.
 */
export const requireAdmin = cache(async () => {
  const me = await adminCall((api) => api.auth.me.query())
  if (!me.modes.includes("admin")) redirect("/sign-in?reason=not-admin")
  return me
})
