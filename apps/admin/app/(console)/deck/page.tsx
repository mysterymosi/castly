import { Button } from "@workspace/ui/components/button"
import type { Metadata } from "next"
import Link from "next/link"

import { TableFrame } from "@/components/deck-parts"
import { Field } from "@/components/field"
import { adminCall } from "@/lib/api"
import { param } from "@/lib/format"

export const metadata: Metadata = { title: "Deck inspector · Castly ops" }

/** Find the booker whose deck to inspect. */
export default async function DeckSearchPage({ searchParams }: PageProps<"/deck">) {
  const query = param((await searchParams).q)?.trim() ?? ""
  const results = query.length >= 2 ? await adminCall((api) => api.admin.bookers.search.query({ query })) : null

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Deck inspector</h1>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Pick a booker, then run their deck as they would see it — nothing is recorded — or open one of their
          sessions to see the reasons stored for each card.
        </p>
      </div>
      <form className="flex max-w-md items-end gap-2">
        <Field label="Booker" name="q" defaultValue={query} placeholder="Email or company" className="flex-1" minLength={2} />
        <Button type="submit" size="lg">
          Search
        </Button>
      </form>
      {results ? (
        results.bookers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No booker matches “{query}”.</p>
        ) : (
          <TableFrame>
            <thead>
              <tr>
                <th>Email</th>
                <th>Company</th>
                <th>Vertical</th>
                <th>City</th>
              </tr>
            </thead>
            <tbody>
              {results.bookers.map((b) => (
                <tr key={b.id} className="hover:bg-muted/50">
                  <td>
                    <Link href={`/deck/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                      {b.email ?? b.id}
                    </Link>
                  </td>
                  <td>{b.companyName ?? "—"}</td>
                  <td>{b.vertical.replaceAll("_", " ")}</td>
                  <td>{b.cityName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )
      ) : null}
    </>
  )
}
