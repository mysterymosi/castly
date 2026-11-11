import { router } from "expo-router"
import { useState } from "react"

import { Screen } from "@/components/ui/screen"
import { ScreenHeader } from "@/components/ui/screen-header"
import { InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { studioApi } from "@/studio/api"
import { CategoryPicker, toggleCategory } from "@/studio/category-picker"
import { useStudio } from "@/studio/studio-provider"

/** The talent's categories, saved on each change. At least one stays picked. */
export default function CategoriesScreen() {
  const { state, run, pending, actionError } = useStudio()
  const [picked, setPicked] = useState<string[]>(() => state?.categoryIds ?? [])

  if (!state) return <LoadingState />

  function toggle(id: string) {
    const next = toggleCategory(picked, id)
    setPicked(next)
    // An empty pick isn't saved: it would hide the talent from every role.
    if (next.length > 0 && next.join() !== state!.categoryIds.join()) {
      void run("categories", () => studioApi.setCategories(next), "Could not save your categories")
    }
  }

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          title="What you do"
          onBack={() => router.back()}
          right={
            pending === "categories" ? (
              <Text variant="footnote" tone="muted">
                Saving…
              </Text>
            ) : null
          }
        />
      }
      contentClassName="gap-6 pt-2"
    >
      <Text variant="body" tone="muted">
        Bookers cast roles by category. You only show up for roles in the categories you pick here.
      </Text>
      <CategoryPicker categories={state.categories} value={picked} onToggle={toggle} />
      {picked.length === 0 ? (
        <InlineError message="Pick at least one so bookers can find you." />
      ) : null}
      {actionError ? <InlineError message={actionError} /> : null}
    </Screen>
  )
}
