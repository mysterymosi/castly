/**
 * A random v4 UUID. Hermes only has `crypto.randomUUID` on newer builds, and this avoids a native
 * module (and so a dev-build rebuild) for what is only a client-chosen id: it deduplicates a
 * message send, tags a request, and keys a local upload.
 */
export function randomUUID(): string {
  const web = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (web?.randomUUID) return web.randomUUID()
  const hex = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, "0")
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16)
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${variant}${hex().slice(1)}-${hex()}${hex()}${hex()}`
}
