import {
  creditDetail,
  portfolioLabels,
  selectAttributes,
  selectAvailability,
  selectCredits,
  selectLanguages,
  selectRates,
  selectSkills,
} from "@workspace/schema"

import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, WebSectionProps } from "../types"

type CreditsConfig = CoreSectionConfigMap["credits"]
export function CreditsSection({ config, context }: WebSectionProps<CreditsConfig>) {
  const credits = selectCredits(config, context.content)
  if (credits.length === 0) return null
  return (
    <SectionShell type="credits" title="Credits">
      <ul className="divide-border divide-y">
        {credits.map((credit, i) => {
          const detail = creditDetail(credit)
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
                      {portfolioLabels.verified}
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
  const attributes = selectAttributes(context.content)
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
  const skills = selectSkills(config, context.content)
  if (skills.length === 0) return null
  return (
    <SectionShell type="skills" title="Skills">
      <ul className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <li
            key={skill.name}
            className={[
              "rounded-full px-3 py-1 text-sm",
              skill.highlighted
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
  const { languages, accents } = selectLanguages(config, context.content)
  if (languages.length === 0 && !accents) return null
  return (
    <SectionShell type="languages" title="Languages">
      {languages.length > 0 ? (
        <ul className="divide-border divide-y">
          {languages.map((language) => (
            <li key={language.name} className="flex justify-between gap-4 py-3">
              <span className="text-foreground font-medium">{language.name}</span>
              {language.fluency ? (
                <span className="text-muted-foreground text-sm">{language.fluency}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {accents ? (
        <p className="text-muted-foreground mt-4 text-sm">
          <span className="text-foreground font-medium">{portfolioLabels.accents}</span>{" "}
          {accents}
        </p>
      ) : null}
    </SectionShell>
  )
}

/** `content.rates` is absent when the viewer may not see rates; the section then renders nothing. */
type RatesConfig = CoreSectionConfigMap["rates"]
export function RatesSection({ config, context }: WebSectionProps<RatesConfig>) {
  const rates = selectRates(config, context.content)
  if (rates.length === 0) return null
  return (
    <SectionShell type="rates" title="Rates">
      <ul className="divide-border divide-y">
        {rates.map((rate) => (
          <li key={rate.kind} className="flex items-baseline justify-between gap-4 py-3">
            <span className="text-foreground font-medium">{rate.label}</span>
            <span className="text-foreground text-right tabular-nums">
              {rate.amount}
              {rate.negotiable ? (
                <span className="text-muted-foreground block text-xs">
                  {portfolioLabels.negotiable}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

const availabilityDot = {
  available: "bg-emerald-500",
  partial: "bg-amber-500",
  booked: "bg-muted-foreground",
} as const

type AvailabilityConfig = CoreSectionConfigMap["availability"]
export function AvailabilitySection({ config, context }: WebSectionProps<AvailabilityConfig>) {
  const months = selectAvailability(config, context.content, context.now)
  if (months.length === 0) return null
  return (
    <SectionShell type="availability" title="Availability">
      <ul className="divide-border divide-y">
        {months.map((entry) => (
          <li key={entry.month} className="flex items-center justify-between gap-4 py-3">
            <span className="text-foreground font-medium">{entry.label}</span>
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <span aria-hidden className={`size-2 rounded-full ${availabilityDot[entry.status]}`} />
              {entry.statusLabel}
            </span>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}
