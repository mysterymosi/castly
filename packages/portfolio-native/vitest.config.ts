import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "react-native": resolve(import.meta.dirname, "test/react-native-stub.ts"),
    },
  },
})
