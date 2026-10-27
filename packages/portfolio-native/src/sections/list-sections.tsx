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
import type { ReactNode } from "react"
import { Text, View } from "react-native"

import {
  CARD_WIDTH,
  LIST_ROW_HEIGHT,
  SECTION_TITLE_HEIGHT,
  TAG_ROW_HEIGHT,
  TAGS_PER_ROW,
  TWO_LINE_ROW_HEIGHT,
} from "../constants"
import { SectionShell, SectionTitle } from "../section-shell"
import type {
  CoreSectionConfigMap,
  NativeSectionRenderer,
  PortfolioContent,
  SectionMediaMeta,
  SectionRendererProps,
} from "../types"

/**
 * Without `content` (studio preview) each section draws placeholder rows sized from its config.
 * With `content` it draws the rows the shared selectors return — the same rows and strings as
 * the web renderer, which the parity suite checks.
 */

const SECTION_BOTTOM = 24
const ACCENTS_LINE_HEIGHT = 28

function listEstimate(rowsHeight: number): number {
  return SECTION_TITLE_HEIGHT + rowsHeight + SECTION_BOTTOM
}

function SkeletonRows({ title, rowCount, cardWidth = CARD_WIDTH }: { title: string; rowCount: number; cardWidth?: number }) {
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>{title}</SectionTitle>
      {Array.from({ length: rowCount }, (_, i) => (
        <View key={i} className="justify-center border-b border-border" style={{ height: LIST_ROW_HEIGHT }}>
          <View className="h-3 rounded-sm bg-surfaceMuted" style={{ width: i % 2 ? "64%" : "88%" }} />
        </View>
      ))}
    </SectionShell>
  )
}

function Row({ left, right, height = LIST_ROW_HEIGHT }: { left: ReactNode; right?: ReactNode; height?: number }) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border" style={{ height }}>
      <View className="min-w-0 flex-1">{left}</View>
      {right ? <View className="items-end">{right}</View> : null}
    </View>
  )
}

function Primary({ children }: { children: ReactNode }) {
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} className="font-bodyMedium text-body text-text">
      {children}
    </Text>
  )
}

function Secondary({ children }: { children: ReactNode }) {
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} className="font-body text-footnote text-textMuted">
      {children}
    </Text>
  )
}

type CreditsConfig = CoreSectionConfigMap["credits"]
function skeletonCreditRows(config: CreditsConfig) {
  return config.limit ?? (config.signatureOnly ? 1 : 5)
}
export function estimateCreditsHeight(config: CreditsConfig, _mediaMeta: SectionMediaMeta, content?: PortfolioContent): number {
  if (!content) return listEstimate(skeletonCreditRows(config) * LIST_ROW_HEIGHT)
  return listEstimate(selectCredits(config, content).length * TWO_LINE_ROW_HEIGHT)
}
function CreditsSection({ config, content, cardWidth = CARD_WIDTH }: SectionRendererProps<CreditsConfig>) {
  if (!content) return <SkeletonRows title="Credits" rowCount={skeletonCreditRows(config)} cardWidth={cardWidth} />
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>Credits</SectionTitle>
      {selectCredits(config, content).map((credit, i) => {
        const detail = creditDetail(credit)
        return (
          <Row
            key={`${credit.title}-${i}`}
            height={TWO_LINE_ROW_HEIGHT}
            left={
              <>
                <View className="flex-row items-center gap-2">
                  <Primary>{credit.title}</Primary>
                  {credit.verified ? <Secondary>{portfolioLabels.verified}</Secondary> : null}
                </View>
                {detail ? <Secondary>{detail}</Secondary> : null}
              </>
            }
            right={credit.year ? <Secondary>{credit.year}</Secondary> : null}
          />
        )
      })}
    </SectionShell>
  )
}
export const creditsRenderer: NativeSectionRenderer<CreditsConfig> = {
  estimateHeight: estimateCreditsHeight,
  Section: CreditsSection,
}

type AttributesConfig = CoreSectionConfigMap["attributes"]
const SKELETON_ATTRIBUTE_ROWS = 6
export function estimateAttributesHeight(_config: AttributesConfig, _mediaMeta: SectionMediaMeta, content?: PortfolioContent): number {
  const rows = content ? selectAttributes(content).length : SKELETON_ATTRIBUTE_ROWS
  return listEstimate(rows * LIST_ROW_HEIGHT)
}
function AttributesSection({ content, cardWidth = CARD_WIDTH }: SectionRendererProps<AttributesConfig>) {
  if (!content) return <SkeletonRows title="Attributes" rowCount={SKELETON_ATTRIBUTE_ROWS} cardWidth={cardWidth} />
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>Attributes</SectionTitle>
      {selectAttributes(content).map((attribute) => (
        <Row
          key={attribute.label}
          left={<Secondary>{attribute.label}</Secondary>}
          right={<Primary>{attribute.value}</Primary>}
        />
      ))}
    </SectionShell>
  )
}
export const attributesRenderer: NativeSectionRenderer<AttributesConfig> = {
  estimateHeight: estimateAttributesHeight,
  Section: AttributesSection,
}

type SkillsConfig = CoreSectionConfigMap["skills"]
export function estimateSkillsHeight(config: SkillsConfig, _mediaMeta: SectionMediaMeta, content?: PortfolioContent): number {
  const rows = content
    ? Math.ceil(selectSkills(config, content).length / TAGS_PER_ROW)
    : (config.highlightTop ?? 5)
  return listEstimate(rows * TAG_ROW_HEIGHT)
}
function SkillsSection({ config, content, cardWidth = CARD_WIDTH }: SectionRendererProps<SkillsConfig>) {
  if (!content) {
    const rows = config.highlightTop ?? 5
    return (
      <SectionShell cardWidth={cardWidth}>
        <SectionTitle>Skills</SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          {Array.from({ length: rows }, (_, i) => (
            <View key={i} className="h-7 rounded-pill bg-surfaceMuted" style={{ width: 96 }} />
          ))}
        </View>
      </SectionShell>
    )
  }
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>Skills</SectionTitle>
      <View className="flex-row flex-wrap gap-2">
        {selectSkills(config, content).map((skill) => (
          <View
            key={skill.name}
            className={`h-7 justify-center rounded-pill px-3 ${skill.highlighted ? "bg-accent" : "bg-surfaceMuted"}`}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              className={`font-body text-footnote ${skill.highlighted ? "text-onAccent" : "text-text"}`}
            >
              {skill.name}
            </Text>
          </View>
        ))}
      </View>
    </SectionShell>
  )
}
export const skillsRenderer: NativeSectionRenderer<SkillsConfig> = {
  estimateHeight: estimateSkillsHeight,
  Section: SkillsSection,
}

type LanguagesConfig = CoreSectionConfigMap["languages"]
function skeletonLanguageRows(config: LanguagesConfig) {
  return config.showAccents ? 5 : 3
}
export function estimateLanguagesHeight(config: LanguagesConfig, _mediaMeta: SectionMediaMeta, content?: PortfolioContent): number {
  if (!content) return listEstimate(skeletonLanguageRows(config) * LIST_ROW_HEIGHT)
  const { languages, accents } = selectLanguages(config, content)
  return listEstimate(languages.length * LIST_ROW_HEIGHT + (accents ? ACCENTS_LINE_HEIGHT : 0))
}
function LanguagesSection({ config, content, cardWidth = CARD_WIDTH }: SectionRendererProps<LanguagesConfig>) {
  if (!content) return <SkeletonRows title="Languages" rowCount={skeletonLanguageRows(config)} cardWidth={cardWidth} />
  const { languages, accents } = selectLanguages(config, content)
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>Languages</SectionTitle>
      {languages.map((language) => (
        <Row
          key={language.name}
          left={<Primary>{language.name}</Primary>}
          right={language.fluency ? <Secondary>{language.fluency}</Secondary> : null}
        />
      ))}
      {accents ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className="mt-2 font-body text-footnote text-textMuted"
          style={{ height: ACCENTS_LINE_HEIGHT - 8 }}
        >
          <Text className="font-bodyMedium text-text">{portfolioLabels.accents}</Text> {accents}
        </Text>
      ) : null}
    </SectionShell>
  )
}
export const languagesRenderer: NativeSectionRenderer<LanguagesConfig> = {
  estimateHeight: estimateLanguagesHeight,
  Section: LanguagesSection,
}

type RatesConfig = CoreSectionConfigMap["rates"]
const SKELETON_RATE_ROWS = 3
export function estimateRatesHeight(config: RatesConfig, _mediaMeta: SectionMediaMeta, content?: PortfolioContent): number {
  if (!content) return listEstimate(SKELETON_RATE_ROWS * LIST_ROW_HEIGHT)
  return listEstimate(selectRates(config, content).length * TWO_LINE_ROW_HEIGHT)
}
function RatesSection({ config, content, cardWidth = CARD_WIDTH }: SectionRendererProps<RatesConfig>) {
  if (!content) return <SkeletonRows title="Rates" rowCount={SKELETON_RATE_ROWS} cardWidth={cardWidth} />
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>Rates</SectionTitle>
      {selectRates(config, content).map((rate) => (
        <Row
          key={rate.kind}
          height={TWO_LINE_ROW_HEIGHT}
          left={<Primary>{rate.label}</Primary>}
          right={
            <>
              <Primary>{rate.amount}</Primary>
              {rate.negotiable ? <Secondary>{portfolioLabels.negotiable}</Secondary> : null}
            </>
          }
        />
      ))}
    </SectionShell>
  )
}
export const ratesRenderer: NativeSectionRenderer<RatesConfig> = {
  estimateHeight: estimateRatesHeight,
  Section: RatesSection,
}

type AvailabilityConfig = CoreSectionConfigMap["availability"]
function skeletonAvailabilityRows(config: AvailabilityConfig) {
  return Math.min(config.horizonMonths ?? 3, 6)
}
export function estimateAvailabilityHeight(
  config: AvailabilityConfig,
  _mediaMeta: SectionMediaMeta,
  content?: PortfolioContent,
  now: Date = new Date(),
): number {
  const rows = content ? selectAvailability(config, content, now).length : skeletonAvailabilityRows(config)
  return listEstimate(rows * LIST_ROW_HEIGHT)
}
function AvailabilitySection({ config, content, now = new Date(), cardWidth = CARD_WIDTH }: SectionRendererProps<AvailabilityConfig>) {
  if (!content) {
    return <SkeletonRows title="Availability" rowCount={skeletonAvailabilityRows(config)} cardWidth={cardWidth} />
  }
  return (
    <SectionShell cardWidth={cardWidth}>
      <SectionTitle>Availability</SectionTitle>
      {selectAvailability(config, content, now).map((entry) => (
        <Row
          key={entry.month}
          left={<Primary>{entry.label}</Primary>}
          right={<Secondary>{entry.statusLabel}</Secondary>}
        />
      ))}
    </SectionShell>
  )
}
export const availabilityRenderer: NativeSectionRenderer<AvailabilityConfig> = {
  estimateHeight: estimateAvailabilityHeight,
  Section: AvailabilitySection,
}
