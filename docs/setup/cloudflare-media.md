# Cloudflare Images setup (Castly M2.5)

> **Currently off.** Images use Supabase Storage for now ([supabase-images.md](./supabase-images.md)). Set `CASTLY_IMAGE_PROVIDER=cf_images` to use this setup again.

Castly uses **Cloudflare Images** for photos and **Mux** for video from the Node API (`apps/api/src/media/`), not Workers bindings. See [mux-video.md](./mux-video.md) for showreel setup.

## Required env (API `.env`)

| Variable | Purpose |
|----------|---------|
| `CF_ACCOUNT_ID` | Account id |
| `CF_API_TOKEN` | API token with **Images Edit** |
| `CF_IMAGES_ACCOUNT_HASH` | Delivery hash (`imagedelivery.net/<hash>/…`) — also embedded in `upload.imagedelivery.net/<hash>/…` URLs |
| `CASTLY_MEDIA_BACKEND` | Set to `remote` in production (`cloudflare` still accepted) |
| `CASTLY_IMAGE_PROVIDER` | Set to `cf_images` |
| `CASTLY_PUBLIC_API_URL` | **Your Castly API base URL** (Mux webhooks, local upload hook), e.g. `https://api.castly.app` |

## One-shot setup script

From repo root (with `CF_ACCOUNT_ID` + `CF_API_TOKEN` in `.env`):

```bash
pnpm cf:media-setup
```

This creates Images variants `thumb`, `card`, `full`, `og` and resolves `CF_IMAGES_ACCOUNT_HASH`.

## Images direct upload

The API uses **Images v2 direct upload** with `multipart/form-data` (not JSON). Clients POST the file to the returned `uploadURL`, then poll `media.status` — the API syncs from Cloudflare when the image has variants.

## Video

Configure **Mux** (`MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`) — see [mux-video.md](./mux-video.md).

## Local development

Use `CASTLY_MEDIA_BACKEND=local` and omit CF vars to exercise the pipeline without Cloudflare.
