import type { MediaStatusOutput } from "@workspace/schema"
import { Image } from "expo-image"
import { StatusBar } from "expo-status-bar"
import { useState } from "react"
import { FlatList, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"

export type ImageViewerState = { mediaIds: string[]; index: number }

/**
 * A gallery's photos full screen, one per page, swiped sideways. Each page pinch-zooms on iOS
 * (a zooming ScrollView); Android shows the photo fitted. The full variant loads over the card
 * variant already in memory.
 */
export function ImageViewer({
  state,
  media,
  onClose,
}: {
  state: ImageViewerState | null
  media: Record<string, MediaStatusOutput>
  onClose: () => void
}) {
  return (
    <Modal
      visible={state !== null}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {state ? <ViewerPages state={state} media={media} onClose={onClose} /> : null}
    </Modal>
  )
}

function ViewerPages({
  state,
  media,
  onClose,
}: {
  state: ImageViewerState
  media: Record<string, MediaStatusOutput>
  onClose: () => void
}) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState(state.index)
  const count = state.mediaIds.length

  return (
    <View style={{ flex: 1, backgroundColor: "rgb(8, 9, 12)" }}>
      <StatusBar style="light" />
      <FlatList
        data={state.mediaIds}
        keyExtractor={(id) => id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={state.index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        renderItem={({ item: id }) => {
          const item = media[id]
          const full = item?.variants?.full ?? item?.variants?.card
          const card = item?.variants?.card
          return (
            <ScrollView
              style={{ width, height }}
              contentContainerStyle={{ width, height }}
              maximumZoomScale={Platform.OS === "ios" ? 3 : 1}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              {full ? (
                <Image
                  source={{ uri: full }}
                  placeholder={card && card !== full ? { uri: card } : item?.blurhash ? { blurhash: item.blurhash } : undefined}
                  placeholderContentFit="contain"
                  contentFit="contain"
                  style={{ width, height }}
                  accessibilityIgnoresInvertColors
                />
              ) : null}
            </ScrollView>
          )
        }}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photos"
          onPress={onClose}
          hitSlop={8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255, 255, 255, 0.16)",
          }}
        >
          <Icon name="close" size={18} tone="onInverse" />
        </Pressable>
        {count > 1 ? (
          <Text variant="body-sm" tone="onInverse" style={{ fontVariant: ["tabular-nums"] }}>
            {page + 1} / {count}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
