import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "react-native": resolve(import.meta.dirname, "test/react-native-dom.tsx"),
    },
    // Both renderer packages must share this package's React: one copy, or hooks and context break.
    dedupe: ["react", "react-dom"],
  },
})
