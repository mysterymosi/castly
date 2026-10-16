/**
 * Web Sentry is a no-op until public SSR routes ship (M3).
 * Mobile and API share one Sentry project via `SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN`.
 */
export function initWebSentry(): void {}
