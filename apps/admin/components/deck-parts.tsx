import type { AdminDeckRunCard, DeckCard } from "@workspace/schema"

import { score } from "@/lib/format"

/** Stage 2 terms in the order the inspector shows them, with short column labels. */
export const TERMS = [
  ["vertical", "Vertical"],
  ["geo", "Location"],
  ["quality", "Quality"],
  ["freshness", "Fresh"],
  ["responsiveness", "Replies"],
  ["role", "Role"],
  ["raisedHand", "Hand"],
  ["boost", "Boost"],
] as const satisfies readonly (readonly [keyof AdminDeckRunCard["components"], string])[]

const reasonLabels: Record<string, string> = {
  vertical: "Vertical match",
  geo: "Location",
  quality: "Profile quality",
  freshness: "Freshness",
  responsiveness: "Responsiveness",
  role: "Role match",
  raisedHand: "Raised hand",
  boost: "Boost",
  exposure: "Exposure penalty",
  exploration: "Exploration slot",
}

type Reason = AdminDeckRunCard["reasons"][number]

/** Photo, name, category and city: who the card is. */
export function TalentCell({ card }: { card: DeckCard | null }) {
  if (!card) return <span className="text-muted-foreground">Talent no longer exists</span>
  const lead = card.decision.leadMediaIds[0]
  const media = lead ? card.media[lead] : undefined
  const photo = media?.variants?.thumb ?? media?.posterUrl ?? null
  const meta = [card.decision.categoryName, card.talent.profile.cityName].filter(Boolean).join(" · ")
  return (
    <div className="flex min-w-48 items-center gap-2">
      {photo ? (
        // Thumbnails come straight from the media host; no optimisation needed for an ops table.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="size-9 shrink-0 rounded object-cover" />
      ) : (
        <div className="size-9 shrink-0 rounded bg-muted" />
      )}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{card.talent.profile.displayName}</span>
        {meta ? <span className="truncate text-muted-foreground">{meta}</span> : null}
      </div>
    </div>
  )
}

function detailText(detail: Reason["detail"]) {
  if (!detail) return null
  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join(" · ")
}

/** The reasons array as stored: what added to (or took from) the card's place, largest first. */
export function ReasonList({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) return <span className="text-muted-foreground">No reasons recorded</span>
  return (
    <ul className="flex min-w-64 flex-col gap-0.5">
      {reasons.map((reason, i) => {
        const detail = detailText(reason.detail)
        return (
          <li key={`${reason.code}-${i}`} className="flex gap-2">
            <span className={reason.contribution < 0 ? "w-14 shrink-0 text-destructive" : "w-14 shrink-0"}>
              {reason.contribution > 0 ? "+" : ""}
              {score(reason.contribution)}
            </span>
            <span>
              {reasonLabels[reason.code] ?? reason.code}
              {detail ? <span className="text-muted-foreground"> ({detail})</span> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** A compact table wrapper that scrolls sideways rather than squeezing columns. */
export function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-xs [&_td]:border-t [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-muted-foreground">
        {children}
      </table>
    </div>
  )
}
