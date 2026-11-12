import type { TalentContentDto, TalentRateDto, TalentSectionDto } from "../talent/dto"
import type { CoreSectionConfigMap } from "./config-types"
import { readStoredPortfolioSection, type PortfolioSection } from "./registry"

/**
 * Display rules shared by the native and web renderers (TECH_SPEC §9.2). Both renderers turn
 * section config + profile rows into the same rows and strings through these functions, so the
 * parity suite only has to catch presentation code that drops or rewrites what they return.
 */

/**
 * Profile data the list sections display: the DTO's `content` plus `rates`. Everything is already
 * filtered for the viewer: a missing `rates` means the viewer may not see rates, and the rates
 * section renders nothing. Fields are optional so a renderer can be given only some rows.
 */
export type PortfolioContent = {
  /**
   * The talent's photos in studio order, Main first. Main leads (the card's first screen, the
   * hero's image); `layoutPortfolio` spreads the rest between sections.
   */
  photoMediaIds?: string[]
  /** The profile's bio: the About section's text unless the section sets its own `body`. */
  bio?: string | null
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

/** Compile-time check: whatever the serializer sends is always renderable. */
const _dtoContentIsRenderable = (content: TalentContentDto): PortfolioContent => content
void _dtoContentIsRenderable

/** The renderers' content for a serialized talent. */
export function portfolioContentFromDto(talent: {
  profile: { bio: string | null }
  photoMediaIds: string[]
  content: TalentContentDto
  rates?: TalentRateDto[]
}): PortfolioContent {
  return {
    ...talent.content,
    rates: talent.rates,
    bio: talent.profile.bio,
    photoMediaIds: talent.photoMediaIds,
  }
}

/** The hero's image: its own, else the Main photo. */
export function selectHeroMediaId(
  config: CoreSectionConfigMap["hero"],
  content: PortfolioContent
): string | null {
  return config.mediaId ?? content.photoMediaIds?.[0] ?? null
}

export type PortfolioLayoutItem<S> =
  | { kind: "section"; section: S }
  | { kind: "photo"; mediaId: string; index: number }

/**
 * Sections with photos spread evenly between them (TECH_SPEC §9.2: the same order on the card and
 * the web page). `photoMediaIds` are the photos after Main, which leads. Photo j goes after section
 * `floor((j + 0.5) × sections / photos)`, so a few photos sit apart through a long portfolio, and
 * more photos than sections double up evenly. With no sections the photos simply follow each
 * other. `index` is the photo's place among all photos (Main is 0), for the viewer.
 */
export function layoutPortfolio<S>(
  sections: S[],
  photoMediaIds: string[],
  /** Index of the first photo given; 1 when Main is shown elsewhere. */
  firstIndex = 1
): PortfolioLayoutItem<S>[] {
  const s = sections.length
  const k = photoMediaIds.length
  const after = new Map<number, string[]>()
  photoMediaIds.forEach((mediaId, j) => {
    const slot = s === 0 ? -1 : Math.min(s - 1, Math.floor(((j + 0.5) * s) / k))
    after.set(slot, [...(after.get(slot) ?? []), mediaId])
  })
  const items: PortfolioLayoutItem<S>[] = []
  let index = firstIndex
  const photos = (slot: number) => {
    for (const mediaId of after.get(slot) ?? []) items.push({ kind: "photo", mediaId, index: index++ })
  }
  photos(-1)
  sections.forEach((section, i) => {
    items.push({ kind: "section", section })
    photos(i)
  })
  return items
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

/**
 * The About text: the section's own `body` when it has one, otherwise the profile bio, which is
 * what the studio's Profile editor writes. Null when neither has text.
 */
export function selectAbout(
  config: CoreSectionConfigMap["about"],
  content: PortfolioContent
): { body: string | null } {
  return { body: config.body?.trim() || content.bio?.trim() || null }
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

/**
 * Months from the current one through `horizonMonths`, in calendar order. A month the talent left
 * unset reads as available; a talent who never set any month gets no rows (the section is empty).
 */
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
  const stored = content.availability ?? []
  if (stored.length === 0) return []
  const byMonth = new Map(stored.map((entry) => [entry.month, entry.status]))
  return Array.from({ length: config.horizonMonths }, (_, offset) => {
    const month = monthKey(now, offset)
    const status = byMonth.get(month) ?? "available"
    return { month, label: monthLabel(month), status, statusLabel: availabilityLabel[status] }
  })
}

/**
 * Whether a section has anything to show this viewer. List sections with no rows are left out of
 * the public page and the deck card; the studio shows an empty state in their place instead.
 */
export function sectionHasContent(
  section: PortfolioSection,
  content: PortfolioContent,
  now: Date
): boolean {
  switch (section.type) {
    case "credits":
      return selectCredits(section.config as CoreSectionConfigMap["credits"], content).length > 0
    case "about":
      return (
        selectAbout(section.config as CoreSectionConfigMap["about"], content).body !== null ||
        Boolean((section.config as CoreSectionConfigMap["about"]).mediaId)
      )
    case "attributes":
      return selectAttributes(content).length > 0
    case "skills":
      return (content.skills ?? []).length > 0
    case "languages": {
      const { languages, accents } = selectLanguages(
        section.config as CoreSectionConfigMap["languages"],
        content
      )
      return languages.length > 0 || accents !== null
    }
    case "rates":
      return selectRates(section.config as CoreSectionConfigMap["rates"], content).length > 0
    case "availability":
      return (
        selectAvailability(section.config as CoreSectionConfigMap["availability"], content, now)
          .length > 0
      )
    default:
      return true
  }
}

/** `readVisibleSections`, without the list sections that have nothing to show (public page, deck). */
export function readRenderableSections(
  sections: Parameters<typeof readVisibleSections>[0],
  content: PortfolioContent,
  now: Date
): ReturnType<typeof readVisibleSections> {
  return readVisibleSections(sections).filter((section) => sectionHasContent(section, content, now))
}

/**
 * The public page's order (also the studio preview's). Main is the image of a hero that has none
 * of its own (`selectHeroMediaId`), and the other photos are spread between the sections. With no
 * such hero, Main comes first when there is no hero at all, and is spread with the rest when the
 * hero shows its own image. `photoMediaIds` should hold only photos the renderer can show (ready,
 * in its media map). The deck card uses `layoutPortfolio` directly: its first screen shows Main.
 */
export function layoutPortfolioPage<S extends { type: string; config: unknown }>(
  sections: S[],
  photoMediaIds: string[]
): PortfolioLayoutItem<S>[] {
  const [main, ...rest] = photoMediaIds
  if (main === undefined) return layoutPortfolio(sections, [])
  const hero = sections.find((section) => section.type === "hero")
  if (!hero) return [{ kind: "photo", mediaId: main, index: 0 }, ...layoutPortfolio(sections, rest)]
  const heroHasOwnImage = Boolean((hero.config as { mediaId?: string | null }).mediaId)
  return heroHasOwnImage ? layoutPortfolio(sections, photoMediaIds, 0) : layoutPortfolio(sections, rest)
}

/** `content` with only the photos the renderer can show (`has`: in its media map, so ready). */
export function withShowablePhotos(
  content: PortfolioContent,
  has: (mediaId: string) => boolean
): PortfolioContent {
  return { ...content, photoMediaIds: (content.photoMediaIds ?? []).filter(has) }
}
