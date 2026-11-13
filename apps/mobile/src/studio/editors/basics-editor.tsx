import type { StudioState } from "@workspace/schema"
import { useState } from "react"
import { View } from "react-native"

import { Chip } from "@/components/ui/chip"
import { TextField } from "@/components/ui/text-field"
import { studioApi } from "@/studio/api"
import { EditorScreen, FieldGroup, isDirty, ToggleRow } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

const BIO_MAX = 2000
const HEADLINE_MAX = 120

function saved(state: StudioState) {
  const { profile } = state.talent
  return {
    displayName: profile.displayName,
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    cityId: profile.cityId,
    willingToTravel: state.editor.willingToTravel,
    openToRelocate: state.editor.openToRelocate,
  }
}

type Draft = ReturnType<typeof saved>

/** Name, headline, bio, city, travel and relocation (2b.2), saved together with the button. */
export function BasicsEditor({ state }: { state: StudioState }) {
  const { run } = useStudio()
  const [draft, setDraft] = useState(() => saved(state))
  const [nameError, setNameError] = useState<string | null>(null)

  function set(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  /** Only the fields that changed, trimmed; null when something is invalid. */
  function changes() {
    const was = saved(state)
    const displayName = draft.displayName.trim()
    if (!displayName) {
      setNameError("Your name can't be empty")
      return null
    }
    const headline = draft.headline.trim()
    const patch: Parameters<typeof studioApi.updateProfile>[0] = {}
    if (displayName !== was.displayName) patch.displayName = displayName
    if (headline !== was.headline) patch.headline = headline || null
    if (draft.bio !== was.bio) patch.bio = draft.bio
    if (draft.cityId && draft.cityId !== was.cityId) patch.cityId = draft.cityId
    if (draft.willingToTravel !== was.willingToTravel) patch.willingToTravel = draft.willingToTravel
    if (draft.openToRelocate !== was.openToRelocate) patch.openToRelocate = draft.openToRelocate
    return patch
  }

  return (
    <EditorScreen
      title="Profile"
      intro="What bookers read at the top of your page and on your card."
      save={{
        dirty: isDirty(draft, saved(state)),
        onSave: async () => {
          const patch = changes()
          if (!patch) return false
          if (Object.keys(patch).length === 0) return true
          return run("basics", () => studioApi.updateProfile(patch), "Could not save your profile")
        },
      }}
    >
      <View className="gap-4">
        <TextField
          label="Name"
          value={draft.displayName}
          maxLength={120}
          autoComplete="name"
          error={nameError}
          onChangeText={(displayName) => {
            set({ displayName })
            setNameError(null)
          }}
        />
        <TextField
          label="Headline"
          value={draft.headline}
          maxLength={HEADLINE_MAX}
          placeholder="Actor and voice artist"
          hint="One line under your name"
          onChangeText={(headline) => set({ headline })}
        />
        <TextField
          label="Bio"
          value={draft.bio}
          multiline
          maxLength={BIO_MAX}
          hint={`${draft.bio.length}/${BIO_MAX}`}
          onChangeText={(bio) => set({ bio })}
        />
      </View>

      <FieldGroup title="City" hint="Bookers cast by location first.">
        <View className="flex-row flex-wrap gap-2">
          {state.cities.map((city) => (
            <Chip
              key={city.id}
              label={city.name}
              selected={draft.cityId === city.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: draft.cityId === city.id }}
              onPress={() => set({ cityId: city.id })}
            />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup title="Getting to set">
        <ToggleRow
          label="Willing to travel"
          hint="For shoots outside your city"
          value={draft.willingToTravel}
          onChange={(willingToTravel) => set({ willingToTravel })}
        />
        <ToggleRow
          label="Open to relocating"
          hint="For long productions"
          value={draft.openToRelocate}
          onChange={(openToRelocate) => set({ openToRelocate })}
        />
      </FieldGroup>
    </EditorScreen>
  )
}
