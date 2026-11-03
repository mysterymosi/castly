import { useMutation } from "@tanstack/react-query"
import { SHORTLIST_NOTE_MAX } from "@workspace/schema"
import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { ScrollView } from "react-native"

import { errorMessage } from "@/auth/session-provider"
import { cacheShortlistDetail } from "@/booker/shortlist-cache"
import { Button } from "@/components/ui/button"
import { InlineError } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { haptics } from "@/lib/haptics"
import { trpcQuery } from "@/trpc/query-client"

/** The booker's private note on one shortlisted talent. Saving it blank clears it. */
export default function ShortlistNoteSheet() {
  const params = useLocalSearchParams<{ shortlistId: string; talentId: string; name: string; note?: string }>()
  const [note, setNote] = useState(params.note ?? "")
  const [error, setError] = useState<string | null>(null)
  const setNoteMutation = useMutation(trpcQuery.shortlist.setNote.mutationOptions({ onSuccess: cacheShortlistDetail }))

  async function save() {
    if (setNoteMutation.isPending) return
    setError(null)
    try {
      await setNoteMutation.mutateAsync({ shortlistId: params.shortlistId, talentId: params.talentId, note })
      haptics.success()
      router.back()
    } catch (caught) {
      haptics.error()
      setError(errorMessage(caught, "Could not save the note"))
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerClassName="gap-4 px-5 pb-10 pt-6"
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="title">Note on {params.name}</Text>
      <TextField
        label="Note"
        hint="Only you can see this."
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Strong Yoruba, check availability for March"
        multiline
        autoFocus
        maxLength={SHORTLIST_NOTE_MAX}
        testID="shortlist-note-input"
      />
      {error ? <InlineError message={error} /> : null}
      <Button label="Save note" loading={setNoteMutation.isPending} onPress={save} />
    </ScrollView>
  )
}
