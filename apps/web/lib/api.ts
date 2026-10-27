import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client"
import type { AppRouter } from "api/router"
import { cache } from "react"

import { apiUrl } from "@/lib/env"

/** Seconds the sitemap's slug list is reused before the API is asked again. */
const SITEMAP_DATA_REVALIDATE = 600

/**
 * Server-only client: anonymous, so the API serialises every talent for a stranger. The web key
 * puts these calls in the web server's own rate-limit bucket rather than its IP's. Headers stay
 * constant per process because they are part of Next's fetch cache key.
 */
function createApiClient(fetchInit?: RequestInit) {
  const webKey = process.env.CASTLY_WEB_API_KEY
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${apiUrl()}/trpc`,
        headers: () => (webKey ? { "x-castly-web-key": webKey } : {}),
        fetch: (url, init) => fetch(url, { ...init, ...fetchInit } as RequestInit),
      }),
    ],
  })
}

const api = createApiClient()

const cachedApi = createApiClient({
  cache: "force-cache",
  next: { revalidate: SITEMAP_DATA_REVALIDATE },
})

function isMissing(error: unknown) {
  return (
    error instanceof TRPCClientError &&
    (error.data?.code === "NOT_FOUND" || error.data?.code === "BAD_REQUEST")
  )
}

/**
 * Live portfolio for `slug`, or null when it is a draft, suspended, unknown, or malformed.
 * Wrapped in `cache` so metadata and the page share one request per render.
 */
export const getPublicPortfolio = cache(async (slug: string) => {
  try {
    return await api.talent.public.bySlug.query({ slug })
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
})

/** A live portfolio as the web app receives it (JSON-serialised API output). */
export type PublicPortfolioResult = NonNullable<Awaited<ReturnType<typeof getPublicPortfolio>>>

/** Cached in Next's data cache; `/api/revalidate` drops it when a talent publishes or unpublishes. */
export function getLiveTalentSlugs() {
  return cachedApi.talent.public.liveSlugs.query()
}
