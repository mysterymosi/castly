import { shadow, type ColorRole } from "@workspace/ui-tokens"

import { Icon, type IconName } from "@/components/ui/icon"
import {
  PressableScale,
  type PressableScaleProps,
} from "@/components/ui/pressable-scale"
import { cn } from "@/lib/cn"

const variants = {
  surface: { container: "bg-surface border border-border", tone: "text" },
  /** Borderless surface: pairs with the squircle's shadow. */
  raised: { container: "bg-surface", tone: "text" },
  /** Over a photo: a dark, see-through pane. */
  glass: { container: "bg-bg/45 border border-text/15", tone: "text" },
  muted: { container: "bg-surfaceMuted", tone: "text" },
  accent: { container: "bg-accent", tone: "onAccent" },
  ghost: { container: "bg-transparent", tone: "text" },
} as const satisfies Record<string, { container: string; tone: ColorRole }>

type IconButtonProps = Omit<
  PressableScaleProps,
  "children" | "accessibilityLabel"
> & {
  icon: IconName
  /** Required: icon-only controls need an accessible name. */
  accessibilityLabel: string
  variant?: keyof typeof variants
  size?: number
  /** `squircle`: Bumble's soft rounded-square header control. */
  shape?: "circle" | "squircle"
}

/** Round (or rounded-square) icon control with a 44pt minimum target. */
export function IconButton({
  icon,
  variant = "surface",
  size = 44,
  shape = "circle",
  className,
  disabled,
  ...rest
}: IconButtonProps) {
  const v = variants[variant]
  return (
    <PressableScale
      haptic="selection"
      disabled={disabled}
      hitSlop={size < 44 ? (44 - size) / 2 : undefined}
      className={cn(
        "items-center justify-center",
        shape === "circle" ? "rounded-pill" : "rounded-lg",
        v.container,
        disabled && "opacity-40",
        className
      )}
      style={{
        width: size,
        height: size,
        boxShadow:
          shape === "squircle" && variant !== "glass" ? shadow.card : undefined,
      }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} tone={v.tone} />
    </PressableScale>
  )
}
