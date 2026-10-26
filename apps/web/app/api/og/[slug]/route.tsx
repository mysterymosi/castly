import { ImageResponse } from "next/og"

import { getPublicPortfolio } from "@/lib/api"
import { siteUrl } from "@/lib/env"

// Link-preview fallback for talents without a ready photo or poster. Cached like the page and
// dropped by `/api/revalidate`. The text comes from the API by slug, never from the query string,
// so nobody can mint a castly.app-branded card with arbitrary words on it.
export const revalidate = 3600

export function generateStaticParams() {
  return []
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const portfolio = await getPublicPortfolio(slug)
  if (!portfolio) return new Response("Not found", { status: 404 })

  const { profile } = portfolio.talent
  const subtitle = [profile.headline, profile.cityName].filter(Boolean).join(" · ")
  const host = new URL(siteUrl()).host

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#111111",
          color: "#fafafa",
        }}
      >
        <div style={{ fontSize: 32, letterSpacing: 4, color: "#a3a3a3" }}>CASTLY</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05 }}>
            {profile.displayName}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 40, marginTop: 24, color: "#d4d4d4" }}>{subtitle}</div>
          ) : null}
        </div>
        <div style={{ fontSize: 30, color: "#a3a3a3" }}>{`${host}/${profile.slug}`}</div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
