/** Server-side base URL of the tRPC API. */
export function apiUrl(): string {
  return (process.env.CASTLY_API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")
}
