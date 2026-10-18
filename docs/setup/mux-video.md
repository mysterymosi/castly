# Mux video setup (Castly M2.5)

Castly uses **Mux** for talent **video** (showreels). **Cloudflare Images** still handles photos.

## Required env (API `.env`)

| Variable | Purpose |
|----------|---------|
| `MUX_TOKEN_ID` | Mux access token id (Video Read + Write) |
| `MUX_TOKEN_SECRET` | Mux access token secret |
| `MUX_WEBHOOK_SECRET` | Signing secret from the Mux webhook you register |
| `MUX_CORS_ORIGIN` | Optional; CORS for direct uploads from mobile (default `*`) |
| `CASTLY_MEDIA_BACKEND` | `cloudflare` when CF Images + Mux are both configured |
| `CASTLY_PUBLIC_API_URL` | Public API base for webhooks, e.g. `https://api.castly.app` |

Cloudflare Images vars (`CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_IMAGES_ACCOUNT_HASH`) remain required for photos.

## Webhook

Register a webhook in [Mux dashboard](https://dashboard.mux.com/settings/webhooks) (or via API):

- **URL:** `{CASTLY_PUBLIC_API_URL}/hooks/mux`
- **Events:** `video.asset.ready`, `video.asset.errored` (recommended)
- Copy the **signing secret** into `MUX_WEBHOOK_SECRET`

The API also **polls** Mux on `media.status` when webhooks are delayed, so local dev works without a tunnel if you poll long enough.

## Direct upload flow

1. Client calls `media.createUploadUrl` with `kind: "video"`.
2. API creates a Mux direct upload with `passthrough` = Castly `mediaId`.
3. Client **PUT**s the file to the returned URL.
4. Mux ingests → asset ready → webhook or poll sets `playbackUrl` (`stream.mux.com`) and poster (`image.mux.com`).

## Local development

Use `CASTLY_MEDIA_BACKEND=local` to exercise uploads via `/hooks/media/upload` without Mux or Cloudflare.
