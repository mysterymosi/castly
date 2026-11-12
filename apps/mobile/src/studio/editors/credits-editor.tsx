import type { StudioState } from "@workspace/schema"
import { router } from "expo-router"
import { Pressable, View } from "react-native"
import { LinearTransition } from "react-native-reanimated"

import { AnimatedView } from "@/components/ui/animated"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { EmptyState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { studioApi } from "@/studio/api"
import { EditorScreen } from "@/studio/editors/kit"
import { asCreditType, creditTypeLabel } from "@/studio/editors/credit-types"
import { useStudio } from "@/studio/studio-provider"

/**
 * The talent's credits in page order (2b.3). The star marks the signature credit, the one the deck
 * card shows; marking another moves it. Arrows reorder, as the section list does.
 */
export function CreditsEditor({ state }: { state: StudioState }) {
  const { run, pending } = useStudio()
  const credits = state.editor.credits

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= credits.length) return
    const ids = credits.map((c) => c.id)
    const [id] = ids.splice(index, 1)
    ids.splice(target, 0, id!)
    void run("credits:reorder", () => studioApi.reorderCredits(ids), "Could not reorder your credits")
  }

  function toggleSignature(credit: StudioState["editor"]["credits"][number]) {
    const { id, verified: _verified, ...fields } = credit
    void run(
      `credit:${id}`,
      () =>
        studioApi.updateCredit({
          creditId: id,
          ...fields,
          type: asCreditType(fields.type),
          isSignature: !credit.isSignature,
        }),
      "Could not update the credit"
    )
  }

  return (
    <EditorScreen
      title="Credits"
      intro="Productions you've worked on. Star your signature credit: it's the one bookers see on your card."
      footer={
        <Button
          label="Add a credit"
          icon="plus"
          onPress={() => router.push("/studio/credit")}
        />
      }
    >
      {credits.length === 0 ? (
        <EmptyState icon="star" title="No credits yet" body="Your first credit puts a Credits section on your page." />
      ) : (
        <View className="gap-2">
          {credits.map((credit, index) => {
            const detail = [credit.roleName, credit.productionCompany, credit.type && creditTypeLabel(credit.type), credit.year]
              .filter(Boolean)
              .join(" · ")
            return (
              <AnimatedView
                key={credit.id}
                layout={LinearTransition.duration(200)}
                className="min-h-16 flex-row items-center gap-1 rounded-xl border border-border bg-surface py-2 pl-1 pr-1"
              >
                <IconButton
                  icon="star"
                  variant={credit.isSignature ? "accent" : "ghost"}
                  size={40}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: credit.isSignature }}
                  accessibilityLabel={
                    credit.isSignature
                      ? `${credit.title} is your signature credit`
                      : `Make ${credit.title} your signature credit`
                  }
                  disabled={pending !== null}
                  onPress={() => toggleSignature(credit)}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${credit.title}`}
                  onPress={() => router.push({ pathname: "/studio/credit", params: { id: credit.id } })}
                  className="flex-1 gap-0.5 py-1 active:opacity-70"
                >
                  <Text variant="body-strong" numberOfLines={1}>
                    {credit.title}
                    {credit.verified ? "  ✓" : ""}
                  </Text>
                  {detail ? (
                    <Text variant="footnote" tone="muted" numberOfLines={1}>
                      {detail}
                    </Text>
                  ) : null}
                </Pressable>
                <IconButton
                  icon="chevron-up"
                  variant="ghost"
                  size={40}
                  accessibilityLabel={`Move ${credit.title} up`}
                  disabled={index === 0 || pending !== null}
                  onPress={() => move(index, -1)}
                />
                <IconButton
                  icon="chevron-down"
                  variant="ghost"
                  size={40}
                  accessibilityLabel={`Move ${credit.title} down`}
                  disabled={index === credits.length - 1 || pending !== null}
                  onPress={() => move(index, 1)}
                />
              </AnimatedView>
            )
          })}
        </View>
      )}
    </EditorScreen>
  )
}
