import { adminDeckSessionSchema } from "@workspace/schema"
import type { Metadata } from "next"
import Link from "next/link"

import { ReasonList, TableFrame, TalentCell } from "@/components/deck-parts"
import { adminCall } from "@/lib/api"
import { dateTime, param, score } from "@/lib/format"
import { replayHref } from "@/lib/replay"

export const metadata: Metadata = { title: "Deck session · Castly ops" }

const decisionLabels = { pass: "Passed", interest: "Interested", save: "Saved" } as const

/**
 * One real session's queue, as stored: the score and reasons written to `deck_queue` when each
 * card was ranked, whether it was served, and what the booker decided.
 */
export default async function SessionPage({ params, searchParams }: PageProps<"/deck/sessions/[sessionId]">) {
  const { sessionId } = await params
  const limit = Math.min(100, Math.max(1, Number(param((await searchParams).limit)) || 50))
  const { session, cards } = adminDeckSessionSchema.parse(
    await adminCall((api) => api.admin.deck.session.query({ sessionId, limit })),
  )
  const hasFilters = Object.keys(session.filters).length > 0

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href={`/deck/${session.bookerId}`} className="text-xs text-muted-foreground hover:text-foreground">
          ← Booker
        </Link>
        <h1 className="text-lg font-medium">Session of {dateTime(session.startedAt)}</h1>
        <p className="text-xs text-muted-foreground">
          {session.roleName ?? "No role"} · seed <span className="font-mono">{session.seed}</span> · {session.queued}{" "}
          queued{hasFilters ? <> · filters <span className="font-mono">{JSON.stringify(session.filters)}</span></> : null}
        </p>
        <p className="text-xs">
          <Link href={replayHref(session.bookerId, session)} className="underline underline-offset-4">
            Re-run with this seed
          </Link>{" "}
          <span className="text-muted-foreground">
            to see every score component. It matches this queue until exposure moves or the booker swipes.
          </span>
        </p>
      </div>
      <TableFrame>
        <thead>
          <tr>
            <th>#</th>
            <th>Talent</th>
            <th>Score</th>
            <th>Served</th>
            <th>Decision</th>
            <th>Reasons (as stored)</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.position}>
              <td className="font-mono">{c.position}</td>
              <td>
                <TalentCell card={c.card} />
              </td>
              <td className="font-mono">{score(c.score)}</td>
              <td className="whitespace-nowrap">{c.servedAt ? dateTime(c.servedAt) : "—"}</td>
              <td>{c.decision ? decisionLabels[c.decision] : "—"}</td>
              <td>
                <ReasonList reasons={c.reasons} />
              </td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
      {session.queued > cards.length ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {cards.length} of {session.queued}.{" "}
          {limit < 100 ? (
            <Link href={`?limit=100`} className="underline underline-offset-4">
              Show up to 100
            </Link>
          ) : null}
        </p>
      ) : null}
    </>
  )
}
