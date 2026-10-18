import { useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import type { StudioState } from "@workspace/schema"

import { mediaApi } from "@/media/api"
import { studioApi } from "@/studio/api"

type Props = {
  state: StudioState
  onComplete: (next: StudioState) => void
}

export function QuickStartWizard({ state, onComplete }: Props) {
  const [displayName, setDisplayName] = useState(state.profile.displayName === "New talent" ? "" : state.profile.displayName)
  const [cityId, setCityId] = useState(state.profile.cityId ?? state.cities[0]?.id ?? "")
  const [bio, setBio] = useState(state.profile.bio ?? "")
  const [skillIds, setSkillIds] = useState<string[]>(state.skillIds.slice(0, 3))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSkill(id: string) {
    setSkillIds((current) => {
      if (current.includes(id)) return current.filter((s) => s !== id)
      if (current.length >= 3) return current
      return [...current, id]
    })
  }

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const mediaIds = await mediaApi.uploadQuickStartPhotos(3)
      const next = await studioApi.completeQuickStart({
        displayName: displayName.trim(),
        cityId,
        bio: bio.trim(),
        skillIds,
        photoMediaIds: mediaIds,
      })
      onComplete(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save quick start")
    } finally {
      setPending(false)
    }
  }

  const ready =
    displayName.trim().length > 0 &&
    cityId.length > 0 &&
    bio.trim().length > 0 &&
    skillIds.length >= 3

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Quick start</Text>
      <Text style={styles.subtitle}>Minimum portfolio in a few minutes — then open the studio.</Text>

      <Text style={styles.label}>Display name</Text>
      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />

      <Text style={styles.label}>City</Text>
      <View style={styles.chips}>
        {state.cities.map((city) => (
          <Pressable
            key={city.id}
            style={[styles.chip, cityId === city.id && styles.chipActive]}
            onPress={() => setCityId(city.id)}
          >
            <Text style={styles.chipText}>{city.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>One-line bio</Text>
      <TextInput style={styles.input} value={bio} onChangeText={setBio} multiline />

      <Text style={styles.label}>Top 3 skills ({skillIds.length}/3)</Text>
      <View style={styles.chips}>
        {state.skills.map((skill) => (
          <Pressable
            key={skill.id}
            style={[styles.chip, skillIds.includes(skill.id) && styles.chipActive]}
            onPress={() => toggleSkill(skill.id)}
          >
            <Text style={styles.chipText}>{skill.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.hint}>Photos: we will create 3 placeholder assets until upload (M2.5) is wired.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, !ready && styles.buttonDisabled]}
        disabled={!ready || pending}
        onPress={submit}
      >
        {pending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Finish quick start</Text>
        )}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#525252", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#f5f5f5",
  },
  chipActive: { backgroundColor: "#dbeafe" },
  chipText: { fontSize: 14 },
  hint: { fontSize: 12, color: "#737373", marginTop: 16 },
  error: { color: "#b91c1c", marginTop: 12 },
  button: {
    marginTop: 20,
    backgroundColor: "#171717",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
})
