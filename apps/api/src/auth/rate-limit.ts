/** One OTP request per address inside this window. A second immediate request is rejected. */
export const PHONE_MIN_INTERVAL_MS = 60_000

/** Hard cap so one address cannot drip requests all day. */
export const PHONE_HOURLY_MAX = 5

/** Shared cap for one network, independent of how many numbers it tries. */
export const IP_WINDOW_MS = 10 * 60_000
export const IP_MAX = 10

const HOUR_MS = 60 * 60_000

export class OtpRateLimited extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super("Too many OTP requests. Try again shortly.")
    this.name = "OtpRateLimited"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function createOtpLimiter(now: () => number = () => Date.now()) {
  const phones = new Map<string, number[]>()
  const ips = new Map<string, number[]>()

  function recent(stamps: number[] | undefined, windowMs: number, at: number) {
    return (stamps ?? []).filter((stamp) => at - stamp < windowMs)
  }

  return {
    reset() {
      phones.clear()
      ips.clear()
    },
    consume(phone: string, ip: string) {
      const at = now()
      const phoneStamps = recent(phones.get(phone), HOUR_MS, at)
      const latest = phoneStamps.at(-1)
      if (latest !== undefined && at - latest < PHONE_MIN_INTERVAL_MS) {
        throw new OtpRateLimited(Math.ceil((PHONE_MIN_INTERVAL_MS - (at - latest)) / 1000))
      }
      if (phoneStamps.length >= PHONE_HOURLY_MAX) {
        const oldest = phoneStamps[0]
        throw new OtpRateLimited(
          oldest === undefined ? 3600 : Math.ceil((HOUR_MS - (at - oldest)) / 1000),
        )
      }

      const ipStamps = recent(ips.get(ip), IP_WINDOW_MS, at)
      if (ipStamps.length >= IP_MAX) {
        const oldest = ipStamps[0]
        throw new OtpRateLimited(
          oldest === undefined ? 600 : Math.ceil((IP_WINDOW_MS - (at - oldest)) / 1000),
        )
      }

      phoneStamps.push(at)
      ipStamps.push(at)
      phones.set(phone, phoneStamps)
      ips.set(ip, ipStamps)
    },
  }
}

export const otpLimiter = createOtpLimiter()
