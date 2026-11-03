import { TRPCClientError } from "@trpc/client"
import { adminDeckRunSchema, deckFiltersSchema, type AdminDeckRun, type DeckFilters } from "@workspace/schema"
import { Button } from "@workspace/ui/components/button"
import type { Metadata } from "next"
import Link from "next/link"

import { ReasonList, TableFrame, TalentCell, TERMS } from "@/components/deck-parts"
import { ErrorNote, Field, SelectField } from "@/components/field"
import { adminCall } from "@/lib/api"
import { dateTime, param, score } from "@/lib/format"
import { replayHref } from "@/lib/replay"

export const metadata: Metadata = { title: "Booker deck · Castly ops" }

/** Override fields are named `o.<ranking_weights key>`; blank ones keep the stored value. */
const OVERRIDE_PREFIX = "o."

type Search = Record<string, string | string[] | undefined>

function parseFilters(raw: string | undefined): { filters: DeckFilters; error: string | null } {
  if (!raw?.trim()) return { filters: {}, error: null }
  try {
    const parsed = deckFiltersSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return { filters: parsed.data, error: null }
    return { filters: {}, error: `Filters don't match the deck's filter shape: ${parsed.error.issues[0]?.message}` }
  } catch {
    return { filters: {}, error: "Filters must be JSON, like {\"categoryIds\": [\"…\"]}" }
  }
}

function parseOverrides(search: Search) {
  return Object.entries(search).flatMap(([name, raw]) => {
    const value = param(raw)?.trim()
    if (!name.startsWith(OVERRIDE_PREFIX) || !value) return []
    return [{ key: name.slice(OVERRIDE_PREFIX.length), value: Number(value) }]
  })
}

export default async function BookerDeckPage({ params, searchParams }: PageProps<"/deck/[bookerId]">) {
  const { bookerId } = await params
  const search = await searchParams
  const [{ booker, roles, sessions }, { settings }] = await Promise.all([
    adminCall((api) => api.admin.deck.booker.query({ bookerId })),
    adminCall((api) => api.admin.rankingWeights.list.query()),
  ])

  const roleId = param(search.roleId) || null
  const seedText = param(search.seed)?.trim() ?? ""
  const limitText = param(search.limit)?.trim() || "30"
  const filtersText = param(search.filters) ?? ""
  const overrides = parseOverrides(search)
  const { filters, error: filtersError } = parseFilters(filtersText)

  let run: AdminDeckRun | null = null
  let runError: string | null = filtersError
  if (param(search.run) && !filtersError) {
    try {
      run = adminDeckRunSchema.parse(
        await adminCall((api) =>
          api.admin.deck.run.query({
          bookerId,
          roleId,
          filters,
          seed: seedText ? Number(seedText) : undefined,
          limit: Number(limitText),
            overrides,
          }),
        ),
      )
    } catch (error) {
      if (!(error instanceof TRPCClientError)) throw error
      runError = error.message
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/deck" className="text-xs text-muted-foreground hover:text-foreground">
          ← Bookers
        </Link>
        <h1 className="text-lg font-medium">{booker.email ?? booker.id}</h1>
        <p className="text-xs text-muted-foreground">
          {[booker.companyName, booker.vertical.replaceAll("_", " "), booker.cityName].filter(Boolean).join(" · ")}
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Recent sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">This booker hasn&apos;t opened a deck yet.</p>
        ) : (
          <TableFrame>
            <thead>
              <tr>
                <th>Started</th>
                <th>Role</th>
                <th>Filters</th>
                <th>Seed</th>
                <th>Served / queued</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/deck/sessions/${s.id}`} className="font-medium underline-offset-4 hover:underline">
                      {dateTime(s.startedAt)}
                    </Link>
                  </td>
                  <td>{s.roleName ?? "No role"}</td>
                  <td className="max-w-64 truncate font-mono">
                    {Object.keys(s.filters).length ? JSON.stringify(s.filters) : "—"}
                  </td>
                  <td className="font-mono">{s.seed}</td>
                  <td>
                    {s.served} / {s.queued}
                  </td>
                  <td>
                    <Link href={replayHref(bookerId, s)} className="underline-offset-4 hover:underline">
                      Re-run with this seed
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Run the deck</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Stages 1–3 exactly as <code>deck.start</code> runs them for this booker. Nothing is written: no session,
            no impressions, no exposure. The same seed gives the same exploration draw, so a session&apos;s seed
            reproduces its order until exposure moves or the booker swipes (a swipe hides that talent).
          </p>
        </div>
        {/* Keyed on the query: a "Re-run" link to this same page must reset the uncontrolled fields. */}
        <form key={JSON.stringify(search)} className="flex flex-col gap-3">
          <input type="hidden" name="run" value="1" />
          <div className="flex flex-wrap items-end gap-3">
            <SelectField label="Role" name="roleId" defaultValue={roleId ?? ""} className="w-64">
              <option value="">No role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.projectName} — {r.name}
                  {r.briefed ? "" : " (no brief)"}
                </option>
              ))}
            </SelectField>
            <Field label="Seed" name="seed" defaultValue={seedText} placeholder="Random" inputMode="numeric" className="w-32" />
            <Field label="Cards" name="limit" defaultValue={limitText} type="number" min={1} max={100} className="w-20" />
            <Field
              label="Filters (JSON)"
              name="filters"
              defaultValue={filtersText}
              placeholder="{}"
              className="min-w-64 flex-1 font-mono"
            />
          </div>
          <details className="rounded-lg border px-3 py-2 text-xs" open={overrides.length > 0}>
            <summary className="cursor-pointer font-medium">
              Try settings for this run{overrides.length ? ` (${overrides.length} changed)` : ""}
            </summary>
            <p className="mt-2 text-muted-foreground">
              Blank keeps the live value (shown greyed). Nothing here is saved; change live values on{" "}
              <Link href="/ranking" className="underline underline-offset-4">
                Ranking settings
              </Link>
              .
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {settings.map((s) => (
                <Field
                  key={s.key}
                  label={s.label}
                  name={`${OVERRIDE_PREFIX}${s.key}`}
                  defaultValue={overrides.find((o) => o.key === s.key)?.value ?? ""}
                  placeholder={String(s.value ?? s.defaultValue)}
                  inputMode="decimal"
                  title={s.description}
                />
              ))}
            </div>
          </details>
          <div>
            <Button type="submit" size="lg">
              Run deck
            </Button>
          </div>
        </form>
        {runError ? <ErrorNote>{runError}</ErrorNote> : null}
        {run ? <RunResult run={run} /> : null}
      </section>
    </>
  )
}

function RunResult({ run }: { run: AdminDeckRun }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Seed <span className="font-mono text-foreground">{run.seed}</span> · {run.candidates} candidates · platform exposure
        percentile at {run.exposureThreshold} impressions (7 days) · showing the top {run.cards.length}
      </p>
      <TableFrame>
        <thead>
          <tr>
            <th>#</th>
            <th>Talent</th>
            <th>Score</th>
            <th title="Place by stage 2's score alone, before fairness">Score rank</th>
            {TERMS.map(([key, label]) => (
              <th key={key} className="text-right">
                {label}
              </th>
            ))}
            <th title="Taken off the score for over-exposure">Penalty</th>
            <th title="7-day / lifetime impressions">Seen</th>
            <th>Why it&apos;s here</th>
          </tr>
        </thead>
        <tbody>
          {run.cards.map((c) => {
            const moved = c.scoreRank - c.position
            return (
              <tr key={c.card.talent.profile.userId}>
                <td className="font-mono">{c.position}</td>
                <td>
                  <TalentCell card={c.card} />
                </td>
                <td className="font-mono">{score(c.score)}</td>
                <td className="font-mono whitespace-nowrap">
                  {c.scoreRank}
                  {moved !== 0 ? (
                    <span className="text-muted-foreground"> ({moved > 0 ? `↑${moved}` : `↓${-moved}`})</span>
                  ) : null}
                  {c.explored ? <span className="ml-1 rounded bg-muted px-1">explore</span> : null}
                </td>
                {TERMS.map(([key]) => (
                  <td key={key} className={c.components[key] === 0 ? "text-right font-mono text-muted-foreground" : "text-right font-mono"}>
                    {score(c.components[key])}
                  </td>
                ))}
                <td className="font-mono">{c.exposurePenalty ? `−${score(c.exposurePenalty)}` : "—"}</td>
                <td className="font-mono whitespace-nowrap">
                  {c.impressions7d} / {c.lifetimeImpressions}
                </td>
                <td>
                  <p className="mb-1 font-medium" title="The line the card shows">
                    {c.reasonText ?? <span className="text-muted-foreground">No line on the card</span>}
                  </p>
                  <ReasonList reasons={c.reasons} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </TableFrame>
    </div>
  )
}
