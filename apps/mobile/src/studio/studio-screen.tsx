import { corePortfolioSectionTypes } from "@workspace/schema"
import type { StudioState } from "@workspace/schema"
import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"

import { mediaApi } from "@/media/api"
import { studioApi } from "@/studio/api"
import { CompletenessMeter } from "@/studio/completeness-meter"
import { DecisionCardPreview } from "@/studio/decision-card-preview"
import { PortfolioPreview } from "@/studio/portfolio-preview"
import { QuickStartWizard } from "@/studio/quick-start-wizard"

const templates = [
  { id: "editorial" as const, label: "Editorial" },
  { id: "reel_first" as const, label: "Reel-first" },
  { id: "case_study" as const, label: "Case study" },
]

export function StudioScreen() {
  const [state, setState] = useState<StudioState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewTab, setPreviewTab] = useState<"portfolio" | "card">("portfolio")
  const [uploadingShowreel, setUploadingShowreel] = useState(false)

  useEffect(() => {
    let cancelled = false
    void studioApi
      .get()
      .then((next) => {
        if (!cancelled) {
          setState(next)
          setError(null)
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Could not load studio",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setState(await studioApi.get())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load studio")
    } finally {
      setLoading(false)
    }
  }, [])

  if (loading && !state) {
    return <ActivityIndicator style={styles.loader} />
  }

  if (error && !state) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.button} onPress={reload}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  if (!state) return null

  if (!state.profile.quickStartCompletedAt) {
    return <QuickStartWizard state={state} onComplete={setState} />
  }

  async function addSection(type: (typeof corePortfolioSectionTypes)[number]) {
    try {
      setState(await studioApi.createSection(type))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add section")
    }
  }

  async function applyTemplate(templateId: (typeof templates)[number]["id"]) {
    try {
      setState(await studioApi.applyTemplate(templateId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not apply template")
    }
  }

  async function moveSection(sectionId: string, direction: -1 | 1) {
    const ordered = [...state!.sections].sort((a, b) => a.position - b.position)
    const index = ordered.findIndex((s) => s.id === sectionId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ordered.length) return
    const next = [...ordered]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    try {
      setState(await studioApi.reorderSections(next.map((s) => s.id)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reorder")
    }
  }

  async function saveCardFact(index: number, value: string) {
    const facts = [...state!.profile.cardConfig.highlightFacts]
    facts[index] = value
    while (facts.length < 3) facts.push("")
    try {
      setState(
        await studioApi.updateProfile({
          cardConfig: { highlightFacts: facts.slice(0, 3) },
        }),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save card")
    }
  }

  async function uploadShowreel() {
    setUploadingShowreel(true)
    setError(null)
    try {
      const uri = await mediaApi.pickVideo()
      if (!uri) return
      const ready = await mediaApi.uploadVideoFromUri(uri)
      let section = state!.sections.find((s) => s.type === "showreel")
      if (!section) {
        setState(await studioApi.createSection("showreel"))
        section = (await studioApi.get()).sections.find((s) => s.type === "showreel")
      }
      if (!section) throw new Error("Could not create showreel section")
      setState(
        await studioApi.updateSection({
          sectionId: section.id,
          schemaVersion: section.schemaVersion,
          config: { mediaId: ready.id },
        }),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Showreel upload failed")
    } finally {
      setUploadingShowreel(false)
    }
  }

  async function fillEthnicity() {
    try {
      setState(await studioApi.setAttribute("ethnicity", "black"))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not set attribute")
    }
  }

  const orderedSections = [...state.sections].sort((a, b) => a.position - b.position)

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Portfolio studio</Text>
      <CompletenessMeter completeness={state.completeness} />
      {error ? <Text style={styles.errorInline}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Templates</Text>
      <View style={styles.row}>
        {templates.map((t) => (
          <Pressable key={t.id} style={styles.chip} onPress={() => applyTemplate(t.id)}>
            <Text>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Sections</Text>
      {orderedSections.map((section) => (
        <View key={section.id} style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>
            {section.type} · {section.isVisible ? "visible" : "hidden"}
          </Text>
          <View style={styles.row}>
            <Pressable onPress={() => moveSection(section.id, -1)}>
              <Text style={styles.link}>Up</Text>
            </Pressable>
            <Pressable onPress={() => moveSection(section.id, 1)}>
              <Text style={styles.link}>Down</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Add section</Text>
      <View style={styles.wrap}>
        {corePortfolioSectionTypes.map((type) => (
          <Pressable key={type} style={styles.chip} onPress={() => addSection(type)}>
            <Text>{type}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Decision card highlights</Text>
      {[0, 1, 2].map((index) => (
        <TextInput
          key={index}
          style={styles.input}
          placeholder={`Highlight ${index + 1}`}
          defaultValue={state.profile.cardConfig.highlightFacts[index] ?? ""}
          onEndEditing={(e) => saveCardFact(index, e.nativeEvent.text)}
        />
      ))}

      <Pressable style={styles.chip} onPress={uploadShowreel} disabled={uploadingShowreel}>
        <Text>{uploadingShowreel ? "Uploading showreel…" : "Upload showreel video"}</Text>
      </Pressable>

      <Pressable style={styles.chip} onPress={fillEthnicity}>
        <Text>Set ethnicity (sensitive — should not affect completeness)</Text>
      </Pressable>

      <View style={styles.previewTabs}>
        <Pressable onPress={() => setPreviewTab("portfolio")}>
          <Text style={previewTab === "portfolio" ? styles.tabActive : styles.tab}>Portfolio</Text>
        </Pressable>
        <Pressable onPress={() => setPreviewTab("card")}>
          <Text style={previewTab === "card" ? styles.tabActive : styles.tab}>Decision card</Text>
        </Pressable>
      </View>

      <View style={styles.previewBox}>
        {previewTab === "portfolio" ? (
          <PortfolioPreview sections={state.sections} />
        ) : (
          <DecisionCardPreview
            displayName={state.profile.displayName}
            headline={state.profile.headline}
            cardConfig={state.profile.cardConfig}
          />
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loader: { marginTop: 40 },
  center: { flex: 1, padding: 16, justifyContent: "center" },
  container: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginTop: 20, marginBottom: 8 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginBottom: 8,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
  },
  sectionLabel: { fontSize: 14 },
  link: { color: "#2563eb", paddingHorizontal: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  previewTabs: { flexDirection: "row", gap: 16, marginTop: 20, marginBottom: 8 },
  tab: { fontSize: 15, color: "#737373" },
  tabActive: { fontSize: 15, fontWeight: "700" },
  previewBox: { height: 480, marginTop: 8 },
  error: { color: "#b91c1c", marginBottom: 12 },
  errorInline: { color: "#b91c1c", marginTop: 8 },
  button: {
    backgroundColor: "#171717",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "#fff" },
})
