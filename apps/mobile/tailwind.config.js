const plugin = require("tailwindcss/plugin")
const {
  colors,
  fontFamily,
  fontSize,
  hexToRgbChannels,
  radius,
  spacing,
} = require("@workspace/ui-tokens")

const px = (record) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, `${value}px`]))

const cssVars = (scheme) =>
  Object.fromEntries(
    Object.entries(colors[scheme]).map(([role, hex]) => [`--color-${role}`, hexToRgbChannels(hex)]),
  )

const themeColors = Object.fromEntries(
  Object.keys(colors.light).map((role) => [role, `rgb(var(--color-${role}) / <alpha-value>)`]),
)

/** @type {import("tailwindcss").Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "../../packages/portfolio-native/src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "media",
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      ...themeColors,
    },
    spacing: px(spacing),
    borderRadius: px(radius),
    fontSize: Object.fromEntries(
      Object.entries(fontSize).map(([key, [size, lineHeight]]) => [
        key,
        [`${size}px`, { lineHeight: `${lineHeight}px` }],
      ]),
    ),
    fontFamily: Object.fromEntries(
      Object.entries(fontFamily).map(([key, family]) => [key, [family]]),
    ),
    extend: {
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": cssVars("light"),
        "@media (prefers-color-scheme: dark)": { ":root": cssVars("dark") },
      })
    }),
  ],
}
