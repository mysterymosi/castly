/**
 * Creates (or updates) the public Supabase Storage bucket for images while Cloudflare
 * Images is switched off. Works against local and hosted projects.
 * Usage (from repo root, with SUPABASE_URL + SUPABASE_SECRET_KEY in `.env`):
 *   pnpm media:supabase-setup
 */
import { loadEnv } from "../packages/db/src/env.js"

loadEnv()

const url = process.env.SUPABASE_URL?.replace(/\/$/, "")
const key = process.env.SUPABASE_SECRET_KEY
const bucket = process.env.SUPABASE_MEDIA_BUCKET?.trim() || "media"

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env")
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
}

// Public read (delivery URLs are unsigned); writes only through API-issued signed URLs.
// Mobile uploads JPEGs resized to 2048px, so 10 MiB leaves plenty of headroom.
const settings = {
  public: true,
  file_size_limit: 10 * 1024 * 1024,
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/heic"],
}

async function main() {
  const existing = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers })
  const response = existing.ok
    ? await fetch(`${url}/storage/v1/bucket/${bucket}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(settings),
      })
    : await fetch(`${url}/storage/v1/bucket`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id: bucket, name: bucket, ...settings }),
      })
  if (!response.ok) {
    throw new Error(`Bucket setup failed (${response.status}): ${await response.text()}`)
  }
  console.log(`bucket ${bucket}: ${existing.ok ? "updated" : "created"}`)

  console.log("\nAdd to .env (if not already):")
  console.log("CASTLY_MEDIA_BACKEND=remote")
  console.log("CASTLY_IMAGE_PROVIDER=supabase")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
