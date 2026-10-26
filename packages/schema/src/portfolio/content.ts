import type { TalentRateDto, TalentSectionDto } from "../talent/dto"
import type { CoreSectionConfigMap } from "./config-types"
import { readStoredPortfolioSection, type PortfolioSection } from "./registry"

/**
 * Display rules shared by the native and web renderers (TECH_SPEC §9.2). Both renderers turn
 * section config + profile rows into the same rows and strings through these functions, so the
 * parity suite only has to catch presentation code that drops or rewrites what they return.
 */

/**
 * Profile data the list sections display. Section configs only carry display options, so the
 * loader supplies the rows. Everything here is already filtered for the viewer: a missing
 * `rates` means the viewer may not see rates, and the rates section renders nothing.
 */
export type PortfolioContent = {
  credits?: {
    title: string
    roleName?: string | null
    productionCompany?: string | null
    year?: number | null
    type?: string | null
    link?: string | null
    isSignature: boolean
    verified: boolean
  }[]
  attributes?: { label: string; value: string }[]
  skills?: { name: string }[]
  languages?: { name: string; fluency?: string | null }[]
  accents?: { name: string }[]
  rates?: TalentRateDto[]
  /** `month` is `YYYY-MM`. */
  availability?: { month: string; status: "available" | "partial" | "booked" }[]
}

export type PortfolioCredit = NonNullable<PortfolioContent["credits"]>[number]

/** Visible sections in position order, forward-migrated and validated, with their row ids. */
export function readVisibleSections(
  sections: (Omit<TalentSectionDto, "config"> & { config?: unknown })[]
): (PortfolioSection & { id: string })[] {
  return sections
    .filter((section) => section.isVisible)
    .sort((a, b) => a.position - b.position)
    .map((section) => ({
      id: section.id,
      ...readStoredPortfolioSection({
        type: section.type,
        schemaVersion: section.schemaVersion,
        config: section.config,
      }),
    }))
}

const LOCALE = "en-NG"

export const portfolioLabels = {
  verified: "Verified",
  negotiable: "Negotiable",
  onRequest: "On request",
  accents: "Accents:",
} as const

function humanize(value: string): string {
  const text = value.replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function selectCredits(
  config: CoreSectionConfigMap["credits"],
  content: PortfolioContent
): PortfolioCredit[] {
  let credits = content.credits ?? []
  if (config.signatureOnly) credits = credits.filter((c) => c.isSignature)
  if (config.limit) credits = credits.slice(0, config.limit)
  return credits
}

/** "Role · Company · Type", or null when none are set. */
export function creditDetail(credit: PortfolioCredit): string | null {
  const detail = [credit.roleName, credit.productionCompany, credit.type].filter(Boolean).join(" · ")
  return detail || null
}

export function selectAttributes(content: PortfolioContent) {
  return content.attributes ?? []
}

export function selectSkills(
  config: CoreSectionConfigMap["skills"],
  content: PortfolioContent
): { name: string; highlighted: boolean }[] {
  const highlighted = config.highlightTop ?? 0
  return (content.skills ?? []).map((skill, i) => ({
    name: skill.name,
    highlighted: i < highlighted,
  }))
}

export function selectLanguages(
  config: CoreSectionConfigMap["languages"],
  content: PortfolioContent
): {
  languages: { name: string; fluency: string | null }[]
  /** Comma-separated accent names, or null when hidden or empty. */
  accents: string | null
} {
  const languages = (content.languages ?? []).map((language) => ({
    name: language.name,
    fluency: language.fluency ? humanize(language.fluency) : null,
  }))
  const accentNames = config.showAccents ? (content.accents ?? []).map((a) => a.name) : []
  return { languages, accents: accentNames.length > 0 ? accentNames.join(", ") : null }
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

function formatRateAmount(rate: TalentRateDto, showCurrency: boolean): string {
  const { amountMin: min, amountMax: max, currency } = rate
  if (min !== null && max !== null && min !== max) {
    return `${formatAmount(min, currency, showCurrency)} – ${formatAmount(max, currency, showCurrency)}`
  }
  const single = min ?? max
  return single === null ? portfolioLabels.onRequest : formatAmount(single, currency, showCurrency)
}

export function selectRates(
  config: CoreSectionConfigMap["rates"],
  content: PortfolioContent
): { kind: TalentRateDto["kind"]; label: string; amount: string; negotiable: boolean }[] {
  return (content.rates ?? []).map((rate) => ({
    kind: rate.kind,
    label: rateKindLabel[rate.kind],
    amount: formatRateAmount(rate, config.showCurrency),
    negotiable: rate.negotiable,
  }))
}

const availabilityLabel = {
  available: "Available",
  partial: "Partly available",
  booked: "Booked",
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

/** Months from the current one through `horizonMonths`, in calendar order. */
export function selectAvailability(
  config: CoreSectionConfigMap["availability"],
  content: PortfolioContent,
  now: Date
): {
  month: string
  label: string
  status: "available" | "partial" | "booked"
  statusLabel: string
}[] {
  const from = monthKey(now, 0)
  const until = monthKey(now, config.horizonMonths)
  return (content.availability ?? [])
    .filter((entry) => entry.month >= from && entry.month < until)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((entry) => ({
      month: entry.month,
      label: monthLabel(entry.month),
      status: entry.status,
      statusLabel: availabilityLabel[entry.status],
    }))
}
