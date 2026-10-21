import { useEffect, useState, type ReactNode } from "react"
import { Dimensions, Keyboard, Platform, ScrollView, View, type KeyboardEvent } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { cn } from "@/lib/cn"

/** Distance the keyboard covers from the bottom of the window. */
function keyboardOverlap(event: KeyboardEvent) {
  const windowHeight = Dimensions.get("window").height
  const covered = Math.max(windowHeight - event.endCoordinates.screenY, 0)
  if (Platform.OS === "ios") return covered > 0 ? event.endCoordinates.height : 0
  return covered
}

function useKeyboardInset() {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (Platform.OS === "web") return

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"
    const show = Keyboard.addListener(showEvent, (event) => {
      setInset(keyboardOverlap(event))
    })
    const hide = Keyboard.addListener(hideEvent, () => {
      setInset(0)
    })
    const frame =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillChangeFrame", (event) => {
            setInset(keyboardOverlap(event))
          })
        : null

    return () => {
      show.remove()
      hide.remove()
      frame?.remove()
    }
  }, [])

  return inset
}

type ScreenProps = {
  children: ReactNode
  /** Wrap content in a ScrollView. */
  scroll?: boolean
  /** Content docked to the bottom above the home indicator (primary CTA bar). */
  footer?: ReactNode
  /** Content pinned above the scroll area (e.g. wizard progress + back button). */
  header?: ReactNode
  edges?: ("top" | "bottom")[]
  className?: string
  contentClassName?: string
  /** Extra bottom inset for content that sits above a tab bar. */
  bottomInset?: number
}

/** Page shell: themed background, safe areas, optional scroll, keyboard avoidance and a docked footer. */
export function Screen({
  children,
  scroll = false,
  footer,
  header,
  edges = ["top", "bottom"],
  className,
  contentClassName,
  bottomInset = 0,
}: ScreenProps) {
  const insets = useSafeAreaInsets()
  const keyboard = useKeyboardInset()
  const top = edges.includes("top") ? Math.max(insets.top, 12) : 0
  const bottom = edges.includes("bottom") ? insets.bottom : 0
  const keyboardOpen = keyboard > 0
  const contentBottom = footer || keyboardOpen ? 0 : bottom + bottomInset
  const footerBottom = (keyboardOpen ? 12 : Math.max(bottom, 12)) + (keyboardOpen ? 0 : bottomInset)

  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={cn("px-5 pt-2", contentClassName)}
      contentContainerStyle={{ paddingBottom: contentBottom + 24 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cn("flex-1 px-5", contentClassName)} style={{ paddingBottom: contentBottom }}>
      {children}
    </View>
  )

  return (
    <View className={cn("flex-1 bg-bg", className)} style={{ paddingTop: top }}>
      <View style={{ flex: 1, paddingBottom: keyboard }}>
        {header}
        {body}
        {footer ? (
          <View className="bg-bg px-5 pt-3" style={{ paddingBottom: footerBottom }}>
            {footer}
          </View>
        ) : null}
      </View>
    </View>
  )
}
