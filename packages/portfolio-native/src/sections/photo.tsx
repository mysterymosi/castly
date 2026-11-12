import { Pressable, View } from "react-native"

import { CARD_WIDTH } from "../constants"
import { mediaHeightForWidth } from "../layout"
import { SectionImage, useOpenPhoto } from "../media"
import type { SectionMediaMeta } from "../types"

/** Portrait by default (4:5); a photo's own shape is kept between 4:3 landscape and 2:3 portrait. */
const DEFAULT_PHOTO_ASPECT = 4 / 5
const MIN_HEIGHT_RATIO = 3 / 4
const MAX_HEIGHT_RATIO = 3 / 2

export function photoHeight(mediaId: string, width: number, mediaMeta: SectionMediaMeta): number {
  const natural = mediaHeightForWidth(mediaId, width, mediaMeta, DEFAULT_PHOTO_ASPECT)
  return Math.min(width * MAX_HEIGHT_RATIO, Math.max(width * MIN_HEIGHT_RATIO, natural))
}

export function estimatePhotoHeight(
  mediaId: string,
  mediaMeta: SectionMediaMeta,
  cardWidth: number = CARD_WIDTH
): number {
  return photoHeight(mediaId, cardWidth, mediaMeta)
}

/**
 * One of the talent's photos between portfolio sections (`layoutPortfolio`), full card width.
 * Tapping opens every photo full screen at this one, when the host supplies a viewer.
 */
export function PortfolioPhoto({
  mediaId,
  mediaMeta,
  index,
  photoMediaIds,
  cardWidth = CARD_WIDTH,
}: {
  mediaId: string
  mediaMeta: SectionMediaMeta
  /** Place among all photos, Main being 0. */
  index: number
  /** All photos, Main first: what the viewer pages through. */
  photoMediaIds: string[]
  cardWidth?: number
}) {
  const openPhoto = useOpenPhoto()
  const height = photoHeight(mediaId, cardWidth, mediaMeta)
  const image = (
    <SectionImage mediaId={mediaId} mediaMeta={mediaMeta} width={cardWidth} height={height} className="rounded-lg" />
  )
  return (
    <View className="self-center" style={{ width: cardWidth, maxWidth: "100%" }}>
      {openPhoto ? (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo ${index + 1} of ${photoMediaIds.length}`}
          onPress={() => openPhoto(photoMediaIds, index)}
          className="active:opacity-80"
        >
          {image}
        </Pressable>
      ) : (
        image
      )}
    </View>
  )
}
