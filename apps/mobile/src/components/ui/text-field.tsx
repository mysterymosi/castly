import { forwardRef, useState } from "react"
import { TextInput, View, type TextInputProps } from "react-native"

import { Text } from "@/components/ui/text"
import { useTokens } from "@/hooks/use-tokens"
import { cn } from "@/lib/cn"

type TextFieldProps = TextInputProps & {
  label: string
  hint?: string
  error?: string | null
  className?: string
  inputClassName?: string
}

/** Labelled input with a visible label, a 3:1 boundary, a focus ring and inline errors. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, className, inputClassName, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const { color } = useTokens()
  const [focused, setFocused] = useState(false)

  return (
    <View className={cn("gap-2", className)}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={color.textMuted}
        selectionColor={color.focus}
        cursorColor={color.text}
        multiline={multiline}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        className={cn(
          "min-h-14 rounded-lg border-2 bg-surface px-4 font-body text-body text-text outline-none",
          multiline ? "min-h-28 py-3" : "py-3",
          error ? "border-passText" : focused ? "border-focus" : "border-borderStrong focus:border-focus",
          inputClassName,
        )}
        style={multiline ? { textAlignVertical: "top" } : undefined}
        {...rest}
      />
      {error ? (
        <Text variant="footnote" tone="pass" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  )
})
