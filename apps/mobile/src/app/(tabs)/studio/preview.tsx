import { router, useLocalSearchParams } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Platform, ScrollView, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ScreenHeader } from "@/components/ui/screen-header"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { DecisionCardPreview } from "@/studio/decision-card-preview"
import { PortfolioPreview } from "@/studio/portfolio-preview"
import { useStudio } from "@/studio/studio-provider"

type Tab = "portfolio" | "card"
const tabs: readonly { value: Tab; label: string }[] = [
  { value: "portfolio", label: "Portfolio" },
  { value: "card", label: "Decision card" },
]

export default function PreviewScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>()
  const { state } = useStudio()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const pager = useRef<ScrollView>(null)
  const initial: Tab = params.tab === "card" ? "card" : "portfolio"
  const [tab, setTab] = useState<Tab>(initial)

  useEffect(() => {
    if (initial === "card") {
      requestAnimationFrame(() => pager.current?.scrollTo({ x: width, animated: false }))
    }
    // Only on mount: later changes come from the control or a swipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function select(next: Tab) {
    setTab(next)
    pager.current?.scrollTo({ x: next === "card" ? width : 0, animated: true })
  }

  if (!state) return <LoadingState />

  const hasVisible = state.sections.some((s) => s.isVisible)

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Platform.OS === "ios" ? 8 : insets.top }}>
      <ScreenHeader title="Preview" backIcon="close" onBack={() => router.back()} />
      <SegmentedControl options={tabs} value={tab} onChange={select} className="mb-3" />
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          setTab(event.nativeEvent.contentOffset.x >= width / 2 ? "card" : "portfolio")
        }}
        className="flex-1"
      >
        <View style={{ width }} className="flex-1 px-4" accessibilityLabel="Portfolio preview">
          {hasVisible ? (
            <PortfolioPreview sections={state.sections} />
          ) : (
            <EmptyState icon="eye-off" title="Nothing visible yet" body="Visible sections will show here as bookers see them." />
          )}
        </View>
        <ScrollView
          style={{ width }}
          contentContainerClassName="px-5 pt-2"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          accessibilityLabel="Decision card preview"
        >
          <DecisionCardPreview
            displayName={state.profile.displayName}
            headline={state.profile.headline}
            cardConfig={state.profile.cardConfig}
          />
        </ScrollView>
      </ScrollView>
    </View>
  )
}
