import type { TalentRateDto } from "@workspace/schema"

import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, WebSectionProps } from "../types"

const LOCALE = "en-NG"

function humanize(value: string): string {
  const text = value.replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

type CreditsConfig = CoreSectionConfigMap["credits"]
export function CreditsSection({ config, context }: WebSectionProps<CreditsConfig>) {
  let credits = context.content.credits ?? []
  if (config.signatureOnly) credits = credits.filter((c) => c.isSignature)
  if (config.limit) credits = credits.slice(0, config.limit)
  if (credits.length === 0) return null
  return (
    <SectionShell type="credits" title="Credits">
      <ul className="divide-border divide-y">
        {credits.map((credit, i) => {
          const detail = [credit.roleName, credit.productionCompany, credit.type]
            .filter(Boolean)
            .join(" · ")
          return (
            <li key={`${credit.title}-${i}`} className="flex items-baseline gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-foreground font-medium">
                  {credit.link ? (
                    <a
                      href={credit.link}
                      target="_blank"
                      rel="nofollow noopener noreferrer ugc"
                      className="underline-offset-4 hover:underline"
                    >
                      {credit.title}
                    </a>
                  ) : (
                    credit.title
                  )}
                  {credit.verified ? (
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      Verified
                    </span>
                  ) : null}
                </p>
                {detail ? (
                  <p className="text-muted-foreground mt-0.5 text-sm">{detail}</p>
                ) : null}
              </div>
              {credit.year ? (
                <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                  {credit.year}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </SectionShell>
  )
}

/** Hidden and sensitive attributes are removed by the serializer before they reach the page. */
type AttributesConfig = CoreSectionConfigMap["attributes"]
export function AttributesSection({ context }: WebSectionProps<AttributesConfig>) {
  const attributes = context.content.attributes ?? []
  if (attributes.length === 0) return null
  return (
    <SectionShell type="attributes" title="Attributes">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {attributes.map((attribute) => (
          <div key={attribute.label}>
            <dt className="text-muted-foreground text-xs">{attribute.label}</dt>
            <dd className="text-foreground mt-0.5 font-medium">{attribute.value}</dd>
          </div>
        ))}
      </dl>
    </SectionShell>
  )
}

type SkillsConfig = CoreSectionConfigMap["skills"]
export function SkillsSection({ config, context }: WebSectionProps<SkillsConfig>) {
  const skills = context.content.skills ?? []
  if (skills.length === 0) return null
  const highlighted = config.highlightTop ?? 0
  return (
    <SectionShell type="skills" title="Skills">
      <ul className="flex flex-wrap gap-2">
        {skills.map((skill, i) => (
          <li
            key={skill.name}
            className={[
              "rounded-full px-3 py-1 text-sm",
              i < highlighted
                ? "bg-primary text-primary-foreground font-medium"
                : "bg-muted text-foreground",
            ].join(" ")}
          >
            {skill.name}
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

type LanguagesConfig = CoreSectionConfigMap["languages"]
export function LanguagesSection({ config, context }: WebSectionProps<LanguagesConfig>) {
  const languages = context.content.languages ?? []
  const accents = config.showAccents ? (context.content.accents ?? []) : []
  if (languages.length === 0 && accents.length === 0) return null
  return (
    <SectionShell type="languages" title="Languages">
      {languages.length > 0 ? (
        <ul className="divide-border divide-y">
          {languages.map((language) => (
            <li key={language.name} className="flex justify-between gap-4 py-3">
              <span className="text-foreground font-medium">{language.name}</span>
              {language.fluency ? (
                <span className="text-muted-foreground text-sm">
                  {humanize(language.fluency)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {accents.length > 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          <span className="text-foreground font-medium">Accents: </span>
          {accents.map((accent) => accent.name).join(", ")}
        </p>
      ) : null}
    </SectionShell>
  )
}

const rateKindLabel: Record<TalentRateDto["kind"], string> = {
  day: "Day rate",
  half_day: "Half-day rate",
  project: "Per project",
}

function formatAmount(amount: number, currency: string, showCurrency: boolean): string {
  return new Intl.NumberFormat(LOCALE, {
    ...(showCurrency ? { style: "currency", currency } : {}),
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatRate(rate: TalentRateDto, showCurrency: boolean): string | null {
  const { amountMin: min, amountMax: max, currency } = rate
  if (min !== null && max !== null && min !== max) {
    return `${formatAmount(min, currency, showCurrency)} – ${formatAmount(max, currency, showCurrency)}`
  }
  const single = min ?? max
  if (single !== null) {
    return formatAmount(single, currency, showCurrency)
  }
  return null
}

/** `content.rates` is absent when the viewer may not see rates; the section then renders nothing. */
type RatesConfig = CoreSectionConfigMap["rates"]
export function RatesSection({ config, context }: WebSectionProps<RatesConfig>) {
  const rates = context.content.rates ?? []
  if (rates.length === 0) return null
  return (
    <SectionShell type="rates" title="Rates">
      <ul className="divide-border divide-y">
        {rates.map((rate) => {
          const amount = formatRate(rate, config.showCurrency)
          return (
            <li key={rate.kind} className="flex items-baseline justify-between gap-4 py-3">
              <span className="text-foreground font-medium">{rateKindLabel[rate.kind]}</span>
              <span className="text-foreground text-right tabular-nums">
                {amount ?? "On request"}
                {rate.negotiable ? (
                  <span className="text-muted-foreground block text-xs">Negotiable</span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </SectionShell>
  )
}

const availabilityLabel = {
  available: "Available",
  partial: "Partly available",
  booked: "Booked",
} as const

const availabilityDot = {
  available: "bg-emerald-500",
  partial: "bg-amber-500",
  booked: "bg-muted-foreground",
} as const

function monthKey(date: Date, offset: number): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number)
  return new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, 1)))
}

type AvailabilityConfig = CoreSectionConfigMap["availability"]
export function AvailabilitySection({ config, context }: WebSectionProps<AvailabilityConfig>) {
  const from = monthKey(context.now, 0)
  const until = monthKey(context.now, config.horizonMonths)
  const months = (context.content.availability ?? [])
    .filter((entry) => entry.month >= from && entry.month < until)
    .sort((a, b) => a.month.localeCompare(b.month))
  if (months.length === 0) return null
  return (
    <SectionShell type="availability" title="Availability">
      <ul className="divide-border divide-y">
        {months.map((entry) => (
          <li key={entry.month} className="flex items-center justify-between gap-4 py-3">
            <span className="text-foreground font-medium">{monthLabel(entry.month)}</span>
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <span aria-hidden className={`size-2 rounded-full ${availabilityDot[entry.status]}`} />
              {availabilityLabel[entry.status]}
            </span>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}
