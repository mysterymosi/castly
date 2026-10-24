import type { ReactNode } from "react"

import type { CoreSectionType } from "./types"

/**
 * Every section renders inside this shell. `data-section-type` is the stable hook the parity
 * extractor and page tests read; class names are presentation and may change freely.
 */
export function SectionShell({
  type,
  title,
  children,
  className,
}: {
  type: CoreSectionType
  /** Visible heading; omitted for the hero. */
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      data-section-type={type}
      className={["px-4 py-8 sm:px-6", className].filter(Boolean).join(" ")}
    >
      {title ? (
        <h2 className="font-heading text-foreground mb-4 text-xl font-semibold tracking-tight"
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  )
}
