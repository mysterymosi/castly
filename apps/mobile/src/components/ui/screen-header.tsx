import type { ReactNode } from "react"
import { View } from "react-native"

import { IconButton } from "@/components/ui/icon-button"
import type { IconName } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"

type ScreenHeaderProps = {
  title?: string
  onBack?: () => void
  backIcon?: Extract<IconName, "chevron-left" | "close">
  backLabel?: string
  right?: ReactNode
}

/** Compact top bar: back/close on the left, centred title, optional action on the right. */
export function ScreenHeader({
  title,
  onBack,
  backIcon = "chevron-left",
  backLabel = backIcon === "close" ? "Close" : "Back",
  right,
}: ScreenHeaderProps) {
  return (
    <View className="min-h-14 flex-row items-center px-3">
      <View className="w-12 items-start">
        {onBack ? (
          <IconButton icon={backIcon} variant="ghost" accessibilityLabel={backLabel} onPress={onBack} />
        ) : null}
      </View>
      <View className="flex-1 items-center">
        {title ? (
          <Text variant="title-sm" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      <View className="min-w-12 items-end pr-2">{right}</View>
    </View>
  )
}
