/** Release name for Sentry. Set `SENTRY_RELEASE` in CI; defaults to `local`. */
export function releaseFromEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = readEnv(key)
    if (value) return value
  }
  return "local"
}

function readEnv(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  const value = env?.[key]?.trim()
  return value || undefined
}
