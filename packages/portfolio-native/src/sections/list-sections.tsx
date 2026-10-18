import { StyleSheet, Text, View } from "react-native"

import {
  CARD_WIDTH,
  LIST_ROW_HEIGHT,
  SECTION_TITLE_HEIGHT,
  TAG_ROW_HEIGHT,
} from "../constants"
import { SectionShell } from "../section-shell"
import type { CoreSectionConfigMap, NativeSectionRenderer, SectionMediaMeta } from "../types"

type SectionRendererProps<T> = { config: T; mediaMeta: SectionMediaMeta; cardWidth?: number }

function listEstimate(rowCount: number): number {
  return SECTION_TITLE_HEIGHT + rowCount * LIST_ROW_HEIGHT + 24
}

function ListSection({
  title,
  rowCount,
  cardWidth = CARD_WIDTH,
}: {
  title: string
  rowCount: number
  cardWidth?: number
}) {
  return (
    <SectionShell cardWidth={cardWidth}>
      <Text style={styles.title}>{title}</Text>
      {Array.from({ length: rowCount }, (_, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.rowLine} />
        </View>
      ))}
    </SectionShell>
  )
}

type CreditsConfig = CoreSectionConfigMap["credits"]
export function estimateCreditsHeight(config: CreditsConfig, _mediaMeta: SectionMediaMeta): number {
  const rows = config.limit ?? (config.signatureOnly ? 1 : 5)
  return listEstimate(rows)
}
function CreditsSection(props: SectionRendererProps<CreditsConfig>) {
  const rows = props.config.limit ?? (props.config.signatureOnly ? 1 : 5)
  return <ListSection title="Credits" rowCount={rows} cardWidth={props.cardWidth} />
}

export const creditsRenderer: NativeSectionRenderer<CreditsConfig> = {
  estimateHeight: estimateCreditsHeight,
  Section: CreditsSection,
}

type AttributesConfig = CoreSectionConfigMap["attributes"]
export function estimateAttributesHeight(_config: AttributesConfig, _mediaMeta: SectionMediaMeta): number {
  return listEstimate(6)
}
function AttributesSection(props: SectionRendererProps<AttributesConfig>) {
  return <ListSection title="Attributes" rowCount={6} cardWidth={props.cardWidth} />
}
export const attributesRenderer: NativeSectionRenderer<AttributesConfig> = {
  estimateHeight: estimateAttributesHeight,
  Section: AttributesSection,
}

type SkillsConfig = CoreSectionConfigMap["skills"]
export function estimateSkillsHeight(config: SkillsConfig, _mediaMeta: SectionMediaMeta): number {
  const rows = config.highlightTop ?? 5
  return SECTION_TITLE_HEIGHT + rows * TAG_ROW_HEIGHT + 24
}
function SkillsSection(props: SectionRendererProps<SkillsConfig>) {
  const rows = props.config.highlightTop ?? 5
  return (
    <SectionShell cardWidth={props.cardWidth ?? CARD_WIDTH}>
      <Text style={styles.title}>Skills</Text>
      <View style={styles.tags}>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={styles.tag} />
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
export function estimateLanguagesHeight(config: LanguagesConfig, _mediaMeta: SectionMediaMeta): number {
  const rows = config.showAccents ? 5 : 3
  return listEstimate(rows)
}
function LanguagesSection(props: SectionRendererProps<LanguagesConfig>) {
  const rows = props.config.showAccents ? 5 : 3
  return <ListSection title="Languages" rowCount={rows} cardWidth={props.cardWidth} />
}
export const languagesRenderer: NativeSectionRenderer<LanguagesConfig> = {
  estimateHeight: estimateLanguagesHeight,
  Section: LanguagesSection,
}

type RatesConfig = CoreSectionConfigMap["rates"]
export function estimateRatesHeight(_config: RatesConfig, _mediaMeta: SectionMediaMeta): number {
  return listEstimate(3)
}
function RatesSection(props: SectionRendererProps<RatesConfig>) {
  return <ListSection title="Rates" rowCount={3} cardWidth={props.cardWidth} />
}
export const ratesRenderer: NativeSectionRenderer<RatesConfig> = {
  estimateHeight: estimateRatesHeight,
  Section: RatesSection,
}

type AvailabilityConfig = CoreSectionConfigMap["availability"]
export function estimateAvailabilityHeight(config: AvailabilityConfig, _mediaMeta: SectionMediaMeta): number {
  const months = config.horizonMonths ?? 3
  return listEstimate(Math.min(months, 6))
}
function AvailabilitySection(props: SectionRendererProps<AvailabilityConfig>) {
  const rows = Math.min(props.config.horizonMonths ?? 3, 6)
  return <ListSection title="Availability" rowCount={rows} cardWidth={props.cardWidth} />
}
export const availabilityRenderer: NativeSectionRenderer<AvailabilityConfig> = {
  estimateHeight: estimateAvailabilityHeight,
  Section: AvailabilitySection,
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  row: { height: LIST_ROW_HEIGHT, justifyContent: "center" },
  rowLine: { height: 12, borderRadius: 4, backgroundColor: "#e5e5e5", width: "90%" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { width: 96, height: 28, borderRadius: 14, backgroundColor: "#f5f5f5" },
})
