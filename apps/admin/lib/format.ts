/** Scores and contributions: three decimals, trailing zeros kept so columns line up. */
export const score = (n: number) => n.toFixed(3)

export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))

/** Every searchParam as one string (the first, when repeated), or undefined. */
export function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
