"use server"

import { TRPCClientError } from "@trpc/client"
import { refresh } from "next/cache"

import { adminCall } from "@/lib/api"

export type SettingState = { error: string | null; saved: boolean }

/** Save one setting, or reset it to its default when the form's `intent` is `reset`. */
export async function updateSetting(_: SettingState, formData: FormData): Promise<SettingState> {
  const key = String(formData.get("key") ?? "")
  const reset = formData.get("intent") === "reset"
  const raw = String(formData.get("value") ?? "").trim()
  if (!reset && raw === "") return { error: "Enter a value, or reset to the default", saved: false }
  const value = reset ? null : Number(raw)
  if (value !== null && !Number.isFinite(value)) return { error: "Enter a number", saved: false }
  try {
    await adminCall((api) => api.admin.rankingWeights.update.mutate({ key, value }))
  } catch (error) {
    if (!(error instanceof TRPCClientError)) throw error
    return { error: error.message, saved: false }
  }
  refresh()
  return { error: null, saved: true }
}
