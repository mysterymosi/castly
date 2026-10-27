import { timingSafeEqual } from "node:crypto"

export const PUBLIC_READ_WINDOW_MS = 60_000

/** Per client IP. A person browsing portfolios never gets near this; a scraper does. */
export const PUBLIC_READ_IP_MAX = 60

/**
 * The web server's own bucket. It renders cached pages for every visitor, so this is a circuit
 * breaker on cache misses (each slug renders at most once per revalidate window), not a
 * per-visitor limit.
 */
export const PUBLIC_READ_WEB_MAX = 1_200

/** Expired windows are swept once this many keys are tracked, so memory stays bounded. */
const SWEEP_AT = 10_000

export class PublicReadRateLimited extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super("Too many requests. Try again shortly.")
    this.name = "PublicReadRateLimited"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function createPublicReadLimiter(now: () => number = () => Date.now()) {
  const windows = new Map<string, { start: number; count: number }>()

  function sweep(at: number) {
    for (const [key, window] of windows) {
      if (at - window.start >= PUBLIC_READ_WINDOW_MS) windows.delete(key)
    }
  }

  return {
    reset() {
      windows.clear()
    },
    consume(key: string, max: number) {
      const at = now()
      let window = windows.get(key)
      if (!window || at - window.start >= PUBLIC_READ_WINDOW_MS) {
        if (windows.size >= SWEEP_AT) sweep(at)
        window = { start: at, count: 0 }
        windows.set(key, window)
      }
      if (window.count >= max) {
        throw new PublicReadRateLimited(
          Math.ceil((PUBLIC_READ_WINDOW_MS - (at - window.start)) / 1000)
        )
      }
      window.count += 1
    },
  }
}

export const publicReadLimiter = createPublicReadLimiter()

/** True when the request carries the web server's key (`CASTLY_WEB_API_KEY`). */
export function isWebServerKey(presented: string | null | undefined): boolean {
  const expected = process.env.CASTLY_WEB_API_KEY
  if (!expected || !presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function consumePublicRead(ip: string, webKey: string | null | undefined) {
  if (isWebServerKey(webKey)) {
    publicReadLimiter.consume("web", PUBLIC_READ_WEB_MAX)
  } else {
    publicReadLimiter.consume(`ip:${ip}`, PUBLIC_READ_IP_MAX)
  }
}
