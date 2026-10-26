/** Server-side base URL of the tRPC API. */
export function apiUrl(): string {
  return (process.env.CASTLY_API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "")
}

/** Public origin of this site, used for canonical URLs, the sitemap, and OG tags. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, "")
  return process.env.NODE_ENV === "production" ? "https://castly.app" : "http://localhost:3000"
}
