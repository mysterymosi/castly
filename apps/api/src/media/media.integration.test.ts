import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { schema } from "@workspace/db"

import type { AuthClient } from "../auth/supabase.js"
import { db } from "../db.js"
import { handleLocalMediaUpload } from "./local-upload.js"
import { applyMediaReadyEvent } from "./service.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { appRouter } from "../trpc/router.js"
import { MediaError } from "./errors.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []

const stubAuth: AuthClient = {
  requestOtp: async () => {},
  verifyOtp: async () => {
    throw new Error("unused")
  },
  refresh: async () => {
    throw new Error("unused")
  },
}

function talentCaller(userId: string) {
  return appRouter.createCaller({
    db,
    ip: "203.0.113.90",
    requestId: "media-integration",
    authorization: "Bearer test-token",
    auth: stubAuth,
    verifyAccessToken: async () => ({ userId }),
  })
}

function parseLocalUploadUrl(uploadUrl: string) {
  const url = new URL(uploadUrl)
  const tokenId = url.pathname.split("/").pop()
  const secret = url.searchParams.get("secret")
  if (!tokenId || !secret) throw new Error("invalid upload url")
  return { tokenId, secret }
}

beforeAll(() => {
  process.env.CASTLY_MEDIA_BACKEND = "local"
  process.env.CASTLY_PUBLIC_API_URL = "http://127.0.0.1:3001"
})

describe("media pipeline (local backend)", () => {
  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
  })

  it("uploads an image to ready and rejects reusing the upload URL", async () => {
    const userId = await seedAuthUser("media-image", adult)
    seededUserIds.push(userId)
    const api = talentCaller(userId)
    await api.auth.enableMode({ mode: "talent" })

    const created = await api.media.createUploadUrl({
      kind: "image",
      contentType: "image/jpeg",
    })

    const { tokenId, secret } = parseLocalUploadUrl(created.uploadUrl)
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )

    await handleLocalMediaUpload(db, tokenId, secret, png, "image")

    await expect(
      handleLocalMediaUpload(db, tokenId, secret, png, "image")
    ).rejects.toBeInstanceOf(MediaError)

    const status = await api.media.status({ mediaId: created.mediaId })
    expect(status.status).toBe("ready")
    expect(status.variants?.card).toContain("media.local.castly")

    const jobs = await db
      .select()
      .from(schema.mediaModerationJobs)
      .where(eq(schema.mediaModerationJobs.mediaId, created.mediaId))
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.status).toBe("pending")
  })

  it("marks video ready with playback URL and poster", async () => {
    const userId = await seedAuthUser("media-video", adult)
    seededUserIds.push(userId)
    const api = talentCaller(userId)
    await api.auth.enableMode({ mode: "talent" })

    const created = await api.media.createUploadUrl({
      kind: "video",
      contentType: "video/mp4",
    })

    await applyMediaReadyEvent(db, {
      mediaId: created.mediaId,
      providerRef: `stream-${randomUUID()}`,
      kind: "video",
      width: 1920,
      height: 1080,
      durationMs: 12_000,
      posterUrl: "https://cdn.example/poster.jpg",
    })

    const status = await api.media.status({ mediaId: created.mediaId })
    expect(status.status).toBe("ready")
    expect(status.playbackUrl).toContain(".m3u8")
    expect(status.posterUrl).toBe("https://cdn.example/poster.jpg")
  })
})

// Hits the local Supabase Storage; needs the bucket from `pnpm media:supabase-setup`.
describe("media pipeline (supabase storage images)", () => {
  beforeAll(() => {
    process.env.CASTLY_MEDIA_BACKEND = "remote"
    process.env.CASTLY_IMAGE_PROVIDER = "supabase"
  })

  afterAll(() => {
    process.env.CASTLY_MEDIA_BACKEND = "local"
    delete process.env.CASTLY_IMAGE_PROVIDER
  })

  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
  })

  it("uploads through a signed PUT and serves the original as every variant", async () => {
    const userId = await seedAuthUser("media-supabase", adult)
    seededUserIds.push(userId)
    const api = talentCaller(userId)
    await api.auth.enableMode({ mode: "talent" })

    const created = await api.media.createUploadUrl({
      kind: "image",
      contentType: "image/png",
    })
    expect(created.uploadMethod).toBe("PUT")
    expect(created.resumable).toBe(false)

    const pending = await api.media.status({ mediaId: created.mediaId })
    expect(pending.status).toBe("pending")

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )
    const upload = await fetch(created.uploadUrl, {
      method: created.uploadMethod,
      headers: created.uploadHeaders,
      body: png,
    })
    expect(upload.ok).toBe(true)

    const status = await api.media.status({ mediaId: created.mediaId })
    expect(status.status).toBe("ready")
    expect(status.width).toBe(1)
    expect(status.height).toBe(1)
    expect(status.variants?.card).toContain(`/storage/v1/object/public/media/images/${userId}/`)
    expect(new Set(Object.values(status.variants ?? {})).size).toBe(1)

    const served = await fetch(status.variants!.full)
    expect(served.status).toBe(200)
    expect(served.headers.get("content-type")).toBe("image/png")
  })
})
