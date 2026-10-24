import { SymbolView, type SymbolViewProps } from "expo-symbols"
import type { ColorRole } from "@workspace/ui-tokens"

import { useTokens } from "@/hooks/use-tokens"

/** One icon family app-wide: SF Symbols on iOS, Material Symbols on Android and web. */
const icons = {
  "chevron-left": { ios: "chevron.left", android: "chevron_left", web: "chevron_left" },
  "chevron-right": { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  "chevron-up": { ios: "chevron.up", android: "keyboard_arrow_up", web: "keyboard_arrow_up" },
  "chevron-down": { ios: "chevron.down", android: "keyboard_arrow_down", web: "keyboard_arrow_down" },
  "arrow-right": { ios: "arrow.right", android: "arrow_forward", web: "arrow_forward" },
  close: { ios: "xmark", android: "close", web: "close" },
  check: { ios: "checkmark", android: "check", web: "check" },
  plus: { ios: "plus", android: "add", web: "add" },
  eye: { ios: "eye", android: "visibility", web: "visibility" },
  "eye-off": { ios: "eye.slash", android: "visibility_off", web: "visibility_off" },
  person: { ios: "person.crop.circle", android: "account_circle", web: "account_circle" },
  studio: { ios: "square.grid.2x2", android: "dashboard", web: "dashboard" },
  video: { ios: "video", android: "videocam", web: "videocam" },
  photo: { ios: "photo.on.rectangle", android: "photo_library", web: "photo_library" },
  location: { ios: "mappin.and.ellipse", android: "location_on", web: "location_on" },
  sparkle: { ios: "sparkles", android: "auto_awesome", web: "auto_awesome" },
  layers: { ios: "square.stack.3d.up", android: "layers", web: "layers" },
  card: { ios: "rectangle.portrait.on.rectangle.portrait", android: "style", web: "style" },
  lock: { ios: "lock", android: "lock", web: "lock" },
  mail: { ios: "envelope", android: "mail", web: "mail" },
  star: { ios: "star", android: "star", web: "star" },
  bookmark: { ios: "bookmark", android: "bookmark", web: "bookmark" },
  share: { ios: "square.and.arrow.up", android: "share", web: "share" },
  briefcase: { ios: "briefcase", android: "work", web: "work" },
  warning: { ios: "exclamationmark.triangle", android: "warning", web: "warning" },
  refresh: { ios: "arrow.clockwise", android: "refresh", web: "refresh" },
  logout: { ios: "rectangle.portrait.and.arrow.right", android: "logout", web: "logout" },
  verified: { ios: "checkmark.seal", android: "verified", web: "verified" },
  code: { ios: "chevron.left.forwardslash.chevron.right", android: "code", web: "code" },
  text: { ios: "text.alignleft", android: "notes", web: "notes" },
  globe: { ios: "globe", android: "language", web: "language" },
  calendar: { ios: "calendar", android: "calendar_month", web: "calendar_month" },
  money: { ios: "banknote", android: "payments", web: "payments" },
  list: { ios: "list.bullet", android: "list", web: "list" },
  film: { ios: "film", android: "movie", web: "movie" },
  play: { ios: "play.fill", android: "play_arrow", web: "play_arrow" },
} as const satisfies Record<string, SymbolViewProps["name"]>

export type IconName = keyof typeof icons

type IconProps = {
  name: IconName
  size?: number
  tone?: ColorRole
  color?: string
}

export function Icon({ name, size = 22, tone = "text", color }: IconProps) {
  const { color: tokens } = useTokens()
  return (
    <SymbolView
      name={icons[name]}
      size={size}
      tintColor={color ?? tokens[tone]}
      weight="semibold"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  )
}
