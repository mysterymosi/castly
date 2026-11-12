import type { StudioState } from "@workspace/schema"
import { useState } from "react"
import { View } from "react-native"

import { Chip } from "@/components/ui/chip"
import { TextField } from "@/components/ui/text-field"
import { studioApi } from "@/studio/api"
import { EditorScreen, FieldGroup, ToggleRow } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

const BIO_MAX = 2000
const HEADLINE_MAX = 120

/** Name, headline, bio, city, travel and relocation (2b.2). Text saves on blur, the rest on tap. */
export function BasicsEditor({ state }: { state: StudioState }) {
  const { run } = useStudio()
  const { profile } = state.talent
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [headline, setHeadline] = useState(profile.headline ?? "")
  const [bio, setBio] = useState(profile.bio ?? "")
  const [nameError, setNameError] = useState<string | null>(null)
  // Local so the switches move at once; the save follows.
  const [travel, setTravel] = useState(state.editor.willingToTravel)
  const [relocate, setRelocate] = useState(state.editor.openToRelocate)

  type Patch = Parameters<typeof studioApi.updateProfile>[0]
  function save(patch: Patch) {
    void run("basics", () => studioApi.updateProfile(patch), "Could not save your profile")
  }

  return (
    <EditorScreen title="Profile" intro="What bookers read at the top of your page and on your card.">
      <View className="gap-4">
        <TextField
          label="Name"
          value={displayName}
          maxLength={120}
          autoComplete="name"
          error={nameError}
          onChangeText={(value) => {
            setDisplayName(value)
            setNameError(null)
          }}
          onBlur={() => {
            const next = displayName.trim()
            if (!next) return setNameError("Your name can't be empty")
            if (next !== profile.displayName) save({ displayName: next })
          }}
        />
        <TextField
          label="Headline"
          value={headline}
          maxLength={HEADLINE_MAX}
          placeholder="Actor and voice artist"
          hint="One line under your name"
          onChangeText={setHeadline}
          onBlur={() => {
            const next = headline.trim()
            if (next !== (profile.headline ?? "")) save({ headline: next || null })
          }}
        />
        <TextField
          label="Bio"
          value={bio}
          multiline
          maxLength={BIO_MAX}
          hint={`${bio.length}/${BIO_MAX}`}
          onChangeText={setBio}
          onBlur={() => {
            if (bio !== (profile.bio ?? "")) save({ bio })
          }}
        />
      </View>

      <FieldGroup title="City" hint="Bookers cast by location first.">
        <View className="flex-row flex-wrap gap-2">
          {state.cities.map((city) => (
            <Chip
              key={city.id}
              label={city.name}
              selected={profile.cityId === city.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: profile.cityId === city.id }}
              onPress={() => {
                if (profile.cityId !== city.id) save({ cityId: city.id })
              }}
            />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup title="Getting to set">
        <ToggleRow
          label="Willing to travel"
          hint="For shoots outside your city"
          value={travel}
          onChange={(willingToTravel) => {
            setTravel(willingToTravel)
            save({ willingToTravel })
          }}
        />
        <ToggleRow
          label="Open to relocating"
          hint="For long productions"
          value={relocate}
          onChange={(openToRelocate) => {
            setRelocate(openToRelocate)
            save({ openToRelocate })
          }}
        />
      </FieldGroup>
    </EditorScreen>
  )
}
