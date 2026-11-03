"use client"

import type { RankingSettings } from "@workspace/schema"
import { Button } from "@workspace/ui/components/button"
import { useActionState } from "react"

import { updateSetting, type SettingState } from "./actions"

type Setting = RankingSettings["settings"][number]

const kindHints = { weight: "0 or more", fraction: "0 – 1", count: "whole number, 1+" } as const

export function SettingRow({ setting }: { setting: Setting }) {
  const [state, action, pending] = useActionState<SettingState, FormData>(updateSetting, { error: null, saved: false })
  const live = setting.value ?? setting.defaultValue
  return (
    <tr>
      <td>
        <div className="flex flex-col">
          <span className="font-medium">{setting.label}</span>
          <span className="text-muted-foreground">{setting.description}</span>
          <span className="font-mono text-muted-foreground">{setting.key}</span>
        </div>
      </td>
      <td className="font-mono">
        {live}
        {setting.value === null ? <span className="ml-1 text-muted-foreground">(default)</span> : null}
      </td>
      <td className="font-mono text-muted-foreground">{setting.defaultValue}</td>
      <td>
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="key" value={setting.key} />
          <input
            name="value"
            aria-label={`New value for ${setting.label}`}
            defaultValue={live}
            key={live}
            inputMode="decimal"
            className="h-7 w-24 rounded-md border border-input bg-background px-2 font-mono outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <Button type="submit" name="intent" value="save" disabled={pending}>
            Save
          </Button>
          {setting.value !== null ? (
            <Button type="submit" name="intent" value="reset" variant="ghost" disabled={pending}>
              Reset
            </Button>
          ) : null}
          <span className="text-muted-foreground">{kindHints[setting.kind]}</span>
        </form>
        {state.error ? (
          <p role="alert" className="mt-1 text-destructive">
            {state.error}
          </p>
        ) : state.saved ? (
          <p role="status" className="mt-1 text-muted-foreground">
            Saved
          </p>
        ) : null}
      </td>
      <td className="text-muted-foreground">
        {setting.updatedBy ? (
          <>
            {setting.updatedBy}
            <br />
            {setting.updatedAt ? new Date(setting.updatedAt).toLocaleString("en-GB") : null}
          </>
        ) : (
          "—"
        )}
      </td>
    </tr>
  )
}
