const LAGOS = "Africa/Lagos"

export class UnderageError extends Error {
  constructor() {
    super("You must be 18 or older to use Castly.")
    this.name = "UnderageError"
  }
}

export class InvalidDateOfBirth extends Error {
  constructor() {
    super("Enter a valid date of birth.")
    this.name = "InvalidDateOfBirth"
  }
}

function calendarParts(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || !month || !day) return null
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

/** Calendar date in Lagos, where the launch audience lives. */
export function lagosDate(now: Date) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  const parts = calendarParts(formatted)
  if (!parts) throw new Error("Could not resolve the Lagos calendar date")
  return parts
}

export function assertAdult(dateOfBirth: string, now = new Date()) {
  const dob = calendarParts(dateOfBirth)
  if (!dob) throw new InvalidDateOfBirth()
  const today = lagosDate(now)
  const eighteenthYear = dob.year + 18
  const isAdult =
    today.year > eighteenthYear ||
    (today.year === eighteenthYear &&
      (today.month > dob.month || (today.month === dob.month && today.day >= dob.day)))
  if (!isAdult) throw new UnderageError()
  if (dob.year < today.year - 120) throw new InvalidDateOfBirth()
}
