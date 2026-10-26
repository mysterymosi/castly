import { timingSafeEqual } from "node:crypto"

import { talentSlugSchema } from "@workspace/schema"
import { revalidatePath } from "next/cache"

/** Called by the API after a talent change. `CASTLY_REVALIDATE_SECRET` must match on both sides. */
function authorized(header: string | null): boolean {
  const secret = process.env.CASTLY_REVALIDATE_SECRET
  if (!secret || !header?.startsWith("Bearer ")) return false
  const a = Buffer.from(header.slice("Bearer ".length))
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as { slug?: unknown } | null
  const slug = talentSlugSchema.safeParse(body?.slug)
  if (!slug.success) {
    return Response.json({ error: "invalid_slug" }, { status: 400 })
  }
  // Drops the cached page and the fetches it made; the next visit re-renders it.
  revalidatePath(`/${slug.data}`)
  revalidatePath("/sitemap.xml")
  return Response.json({ revalidated: true })
}
