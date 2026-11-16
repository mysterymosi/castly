import { portfolioLayoutFor } from "@workspace/core/portfolio-layout"
import { availabilityMonthKey, portfolioContentFromDto, selectRates, type StudioState } from "@workspace/schema"
import { router } from "expo-router"
import type { ReactNode } from "react"

import { editorRoute, emptySectionPrompt, sectionMeta, type CoreSectionType } from "@/studio/section-meta"
import { PillsField, ProfileSection, TextBoxField } from "@/studio/profile-section"
import { ShowreelField } from "@/studio/showreel-card"

/** The line under each heading: what goes here, in the talent's terms. */
const subtitles: Record<CoreSectionType, string> = {
  hero: "",
  about: "Your name, headline, city and a few lines in your own words.",
  attributes: "Height, build and the other details casting asks for.",
  skills: "Up to 20. Your first five stand out on your page.",
  languages: "Languages you work in, and accents you can do on cue.",
  credits: "Productions you've worked on. Star the one bookers should see first.",
  showreel: "One video of your best work.",
  availability: "Let bookers know when you're free.",
  rates: "What you charge, and who gets to see it.",
}

/** "Height (cm)" + "180" → "180 cm"; values without a unit read on their own. */
function attributePill(label: string, value: string) {
  const unit = /\(([^)]+)\)$/.exec(label)?.[1]
  return unit ? `${value} ${unit}` : value
}

function monthPill(month: string, status: string) {
  const [year, m] = month.split("-").map(Number)
  const name = new Intl.DateTimeFormat("en-NG", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year!, m! - 1, 1))
  )
  return `${name} · ${status === "booked" ? "Booked" : status === "partial" ? "Some days" : "Free"}`
}

/** Pills for a list section; empty means it isn't on the portfolio yet. */
function values(type: CoreSectionType, state: StudioState): string[] {
  const { content } = state.talent
  switch (type) {
    case "attributes":
      return content.attributes.map((a) => attributePill(a.label, a.value))
    case "skills":
      return content.skills.map((s) => s.name)
    case "languages":
      return [...content.languages.map((l) => l.name), ...content.accents.map((a) => `${a.name} accent`)]
    case "credits":
      return content.credits.map((c) => c.title)
    case "availability":
    {
      // The next three months; stored rows can include ones already past.
      const now = availabilityMonthKey(new Date())
      return content.availability
        .filter((m) => m.month >= now)
        .slice(0, 3)
        .map((m) => monthPill(m.month, m.status))
    }
    case "rates":
      // Formatted as the portfolio formats them, so the studio reads like the page.
      return selectRates({ showCurrency: true }, portfolioContentFromDto(state.talent)).map(
        (r) => `${r.label} ${r.amount}`
      )
    default:
      return []
  }
}

/**
 * The portfolio's sections in the order bookers see them, fixed by the talent's primary category.
 * Each is a heading and one field to fill; empty ones stay off the portfolio until filled.
 */
export function PortfolioSections({ state }: { state: StudioState }) {
  const primary = state.categories.find((c) => c.id === state.categoryIds[0])
  const layout = portfolioLayoutFor(primary?.kind ?? null)

  return layout.map((type) => {
    const meta = sectionMeta[type]
    const route = editorRoute(type)
    const open = () => {
      if (route) router.push(route)
    }
    let field: ReactNode
    if (type === "showreel") field = <ShowreelField state={state} />
    else if (type === "about")
      field = (
        <TextBoxField
          title={meta.label}
          text={state.talent.profile.bio?.trim() || null}
          emptyLabel="Write your bio"
          onPress={open}
        />
      )
    else
      field = (
        <PillsField
          title={meta.label}
          values={values(type, state)}
          emptyLabel={emptySectionPrompt(type)}
          onPress={open}
        />
      )
    return (
      <ProfileSection key={type} title={meta.label} subtitle={subtitles[type]}>
        {field}
      </ProfileSection>
    )
  })
}
