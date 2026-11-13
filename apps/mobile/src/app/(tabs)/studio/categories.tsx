import { useState } from "react"

import { InlineError, LoadingState } from "@/components/ui/states"
import { studioApi } from "@/studio/api"
import { CategoryPicker, toggleCategory } from "@/studio/category-picker"
import { EditorScreen, isDirty } from "@/studio/editors/kit"
import { useStudio } from "@/studio/studio-provider"

/** The talent's categories, the first as primary (it picks the portfolio's layout). */
export default function CategoriesScreen() {
  const { state, run } = useStudio()
  const [picked, setPicked] = useState<string[]>(() => state?.categoryIds ?? [])

  if (!state) return <LoadingState />

  const empty = picked.length === 0

  return (
    <EditorScreen
      title="What you do"
      intro="Bookers cast roles by category. You only show up for roles in the categories you pick here."
      save={{
        dirty: isDirty(picked, state.categoryIds),
        // An empty pick would hide the talent from every role.
        disabled: empty,
        onSave: () => run("categories", () => studioApi.setCategories(picked), "Could not save your categories"),
      }}
    >
      <CategoryPicker categories={state.categories} value={picked} onToggle={(id) => setPicked(toggleCategory(picked, id))} />
      {empty ? <InlineError message="Pick at least one so bookers can find you." /> : null}
    </EditorScreen>
  )
}
