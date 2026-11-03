import type { Metadata } from "next"
import Link from "next/link"

import { TableFrame } from "@/components/deck-parts"
import { adminCall } from "@/lib/api"

import { SettingRow } from "./setting-row"

export const metadata: Metadata = { title: "Ranking settings · Castly ops" }

const groups = [
  { id: "scoring", title: "Scoring weights (stage 2)", body: "How much each term adds to a card's score." },
  {
    id: "fairness",
    title: "Fairness (stage 3)",
    body: "Exposure penalty, exploration slots and diversity spacing, applied after scoring.",
  },
] as const

/** `ranking_weights`, editable live (TECH_SPEC §19). */
export default async function RankingPage() {
  const { settings, cacheSeconds } = await adminCall((api) => api.admin.rankingWeights.list.query())
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Ranking settings</h1>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Saved values apply to new decks and refills within {cacheSeconds} seconds; sessions already queued keep
          their order. To see what a change would do first, try it on a booker in the{" "}
          <Link href="/deck" className="underline underline-offset-4">
            deck inspector
          </Link>
          .
        </p>
      </div>
      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          <div>
            <h2 className="text-sm font-medium">{group.title}</h2>
            <p className="text-xs text-muted-foreground">{group.body}</p>
          </div>
          <TableFrame>
            <thead>
              <tr>
                <th>Setting</th>
                <th>Live</th>
                <th>Default</th>
                <th>Change</th>
                <th>Last changed</th>
              </tr>
            </thead>
            <tbody>
              {settings
                .filter((s) => s.group === group.id)
                .map((setting) => (
                  <SettingRow key={setting.key} setting={setting} />
                ))}
            </tbody>
          </TableFrame>
        </section>
      ))}
    </>
  )
}
