import {
  mediaMetaFromStatus,
  PortfolioSections,
  sectionsFromDto,
} from "@workspace/portfolio-web"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"

import { getPublicPortfolio } from "@/lib/api"
import { portfolioMetadata } from "@/lib/portfolio-metadata"

// ISR: each slug renders on its first visit, then is served from cache and re-rendered in the
// background at most once a minute. The API calls `/api/revalidate` on every talent change, so
// edits, unpublishing, and suspension show on the next visit; this window is only the backstop.
// Rendering completes before anything is sent, so a draft is a real 404, not a streamed one.
export const revalidate = 60

/** No slugs at build time (the API is not reachable then); every page renders on demand. */
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const portfolio = await getPublicPortfolio(slug)
  if (!portfolio) return {}
  return portfolioMetadata(portfolio)
}

export default async function TalentPortfolioPage({ params }: Props) {
  const { slug } = await params
  const portfolio = await getPublicPortfolio(slug)
  if (!portfolio) notFound()

  const { talent, skills, media } = portfolio
  const { profile } = talent
  // One URL per talent: `/Tunde-Adeyemi` and `/tunde-adeyemi` resolve to the stored slug.
  if (slug !== profile.slug) permanentRedirect(`/${profile.slug}`)

  return (
    <main className="min-h-svh pb-16">
      <header className="mx-auto w-full max-w-3xl px-4 pt-10 pb-2 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {profile.displayName}
        </h1>
        {profile.headline || profile.cityName ? (
          <p className="text-muted-foreground mt-2 text-base">
            {[profile.headline, profile.cityName].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </header>
      <PortfolioSections
        sections={sectionsFromDto(talent.sections)}
        mediaMeta={mediaMetaFromStatus(media)}
        content={{ skills, rates: talent.rates }}
      />
      <footer className="text-muted-foreground mx-auto mt-12 w-full max-w-3xl px-4 text-sm sm:px-6">
        Portfolio on <Link href="/" className="text-foreground font-medium">Castly</Link>
      </footer>
    </main>
  )
}
