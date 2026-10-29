# Supabase Storage images (temporary)

Until Cloudflare Images is turned back on, photos upload to a public **Supabase Storage** bucket. Video stays on Mux ([mux-video.md](./mux-video.md)).

## Setup

```bash
pnpm media:supabase-setup   # creates/updates the `media` bucket (public read, 10 MiB, image MIME types)
```

Run it once per Supabase project (local and hosted). `.env`:

| Variable | Purpose |
|----------|---------|
| `CASTLY_MEDIA_BACKEND` | `remote` (or legacy `cloudflare`) |
| `CASTLY_IMAGE_PROVIDER` | `supabase` (default) |
| `SUPABASE_MEDIA_BUCKET` | Optional, default `media` |
| `SUPABASE_PUBLIC_URL` | Optional. Origin phones and browsers use for uploads and image URLs when `SUPABASE_URL` is loopback (e.g. `http://<LAN IP>:54321`) |

## How it works

1. `media.createUploadUrl` asks Storage for a signed upload URL (valid 2h, single object) and returns it with `uploadMethod: "PUT"`, `resumable: false`. The object path (`images/<ownerId>/<mediaId>`) is the `providerRef`.
2. The client PUTs the whole file to that URL.
3. `media.status` fetches the object with the service key; once it exists, the API reads width/height from the bytes and marks the asset ready.

Limits on the free plan: **no resizing**, so `card`/`thumb`/`full`/`og` are all the original (mobile uploads JPEGs resized to 2048px), and there's no blurhash.

## Switching back to Cloudflare Images

Set `CASTLY_IMAGE_PROVIDER=cf_images` and follow [cloudflare-media.md](./cloudflare-media.md). Only new uploads move; existing rows keep `provider = 'supabase'` and keep serving from Storage, because delivery URLs are built per row. Migrating old images means re-uploading them to Cloudflare and rewriting `provider`/`provider_ref`.
