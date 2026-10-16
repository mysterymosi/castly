import * as Sentry from "@sentry/react-native"

import { releaseFromEnv } from "@workspace/core/release"

export function initMobileSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim()
  console.log("Sentry mobile probe init", dsn)
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: __DEV__ ? "development" : "production",
    release: releaseFromEnv("EXPO_PUBLIC_SENTRY_RELEASE", "SENTRY_RELEASE"),
    tracesSampleRate: __DEV__ ? 1 : 0.2,
  })
}

export { Sentry }
