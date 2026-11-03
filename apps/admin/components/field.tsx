import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps } from "react"

const inputClass =
  "h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"

/** A labelled input. */
export function Field({
  label,
  hint,
  className,
  ...input
}: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs", className)}>
      <span className="font-medium">{label}</span>
      <input className={inputClass} {...input} />
      {hint ? <span className="text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

/** A labelled native select. */
export function SelectField({
  label,
  className,
  children,
  ...select
}: ComponentProps<"select"> & { label: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs", className)}>
      <span className="font-medium">{label}</span>
      <select className={inputClass} {...select}>
        {children}
      </select>
    </label>
  )
}

/** An error the page can recover from, shown in place. */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {children}
    </p>
  )
}
