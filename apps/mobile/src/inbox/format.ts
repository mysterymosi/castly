const time = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" })
const weekday = new Intl.DateTimeFormat("en-NG", { weekday: "long" })
const weekdayShort = new Intl.DateTimeFormat("en-NG", { weekday: "short" })
const dayMonth = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" })
const dayMonthYear = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" })

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole calendar days from `date` to today, in the phone's time zone. */
function daysAgo(date: Date, now = new Date()) {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(now) - start(date)) / DAY_MS)
}

export const clockTime = (iso: string) => time.format(new Date(iso))

/** An inbox row's date: the time today, then "Yesterday", the weekday this week, then the date. */
export function listStamp(iso: string) {
  const date = new Date(iso)
  const days = daysAgo(date)
  if (days <= 0) return time.format(date)
  if (days === 1) return "Yesterday"
  if (days < 7) return weekdayShort.format(date)
  return date.getFullYear() === new Date().getFullYear()
    ? dayMonth.format(date)
    : dayMonthYear.format(date)
}

/** A chat's day divider: "Today", "Yesterday", the weekday this week, then the full date. */
export function dayDivider(iso: string) {
  const date = new Date(iso)
  const days = daysAgo(date)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return weekday.format(date)
  return dayMonthYear.format(date)
}

export function sameDay(a: string, b: string) {
  return daysAgo(new Date(a), new Date(b)) === 0
}

export const shortDate = (iso: string) => dayMonth.format(new Date(iso))

/** An interest's deadline: "Respond today" on its last day, else "Respond by 3 Dec". */
export function respondBy(iso: string) {
  return daysAgo(new Date(iso)) >= 0 ? "Respond today" : `Respond by ${shortDate(iso)}`
}

/** "0:42", "3:05", "1:02:10" */
export function duration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}
