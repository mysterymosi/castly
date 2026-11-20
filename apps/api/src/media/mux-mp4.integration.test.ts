import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import { cleanupDeckFixtures, newUser } from "../test/deck-fixtures.js"
import { handleMuxVideoWebhook } from "./mux-webhook.js"
import { toMediaStatus } from "./service.js"

const PLAYBACK_ID = "pbChatClip01"

/** A chat video Mux has finished streaming, with its MP4 still being made. */
async function chatVideo() {
  const ownerId = await newUser("mp4-owner")
  const id = randomUUID()
  await db.insert(schema.mediaAssets).values({
    id,
    ownerId,
    kind: "video",
    provider: "mux",
    providerRef: PLAYBACK_ID,
    status: "ready",
    mp4Status: "preparing",
  })
  return id
}

async function status(id: string) {
  const [row] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, id))
  return { row: row!, out: toMediaStatus(row!) }
}

const rendition = (type: string, mediaId: string, file: Record<string, string>) =>
  handleMuxVideoWebhook(db, JSON.stringify({ type, data: { passthrough: mediaId, ...file } }))

describe("chat video MP4", () => {
  afterEach(cleanupDeckFixtures)

  it("serves the MP4 once its rendition is ready, and only then", async () => {
    const id = await chatVideo()
    expect((await status(id)).out).toMatchObject({
      playbackUrl: `https://stream.mux.com/${PLAYBACK_ID}.m3u8`,
      mp4Url: null,
    })

    // Another resolution's event is not the chat MP4.
    await rendition("video.asset.static_rendition.ready", id, {
      name: "highest.mp4",
      resolution: "highest",
      status: "ready",
    })
    expect((await status(id)).out.mp4Url).toBeNull()

    await rendition("video.asset.static_rendition.ready", id, {
      name: "720p.mp4",
      resolution: "720p",
      status: "ready",
    })
    expect((await status(id)).out.mp4Url).toBe(`https://stream.mux.com/${PLAYBACK_ID}/720p.mp4`)

    // A late or repeated event can't undo a settled rendition.
    await rendition("video.asset.static_rendition.errored", id, { resolution: "720p", status: "errored" })
    expect((await status(id)).row).toMatchObject({ mp4Status: "ready", mp4Name: "720p.mp4" })
  })

  it("records a skipped rendition and keeps streaming", async () => {
    const id = await chatVideo()
    await rendition("video.asset.static_rendition.skipped", id, { resolution: "720p", status: "skipped" })
    const { row, out } = await status(id)
    expect(row).toMatchObject({ mp4Status: "skipped", mp4Name: null })
    expect(out).toMatchObject({ mp4Url: null, playbackUrl: `https://stream.mux.com/${PLAYBACK_ID}.m3u8` })
  })

  it("takes an MP4 that is ready with the stream from the asset-ready event", async () => {
    const id = await chatVideo()
    await db.update(schema.mediaAssets).set({ status: "processing" }).where(eq(schema.mediaAssets.id, id))
    await handleMuxVideoWebhook(
      db,
      JSON.stringify({
        type: "video.asset.ready",
        data: {
          passthrough: id,
          status: "ready",
          playback_ids: [{ id: PLAYBACK_ID }],
          tracks: [{ type: "video", max_width: 720, max_height: 1280, duration: 4.2 }],
          static_renditions: { files: [{ name: "720p.mp4", resolution: "720p", status: "ready" }] },
        },
      }),
    )
    expect((await status(id)).out).toMatchObject({
      status: "ready",
      mp4Url: `https://stream.mux.com/${PLAYBACK_ID}/720p.mp4`,
    })
  })

  it("finds the media through the asset when a rendition event has no passthrough", async () => {
    const id = await chatVideo()
    const asked: string[] = []
    await handleMuxVideoWebhook(
      db,
      JSON.stringify({
        type: "video.asset.static_rendition.ready",
        data: { asset_id: "asset-123", name: "720p.mp4", resolution: "720p", status: "ready" },
      }),
      { assetPassthrough: async (assetId) => (asked.push(assetId), id) },
    )
    expect(asked).toEqual(["asset-123"])
    expect((await status(id)).out.mp4Url).toBe(`https://stream.mux.com/${PLAYBACK_ID}/720p.mp4`)
  })

  it("leaves video that never asked for an MP4 alone", async () => {
    const id = await chatVideo()
    await db.update(schema.mediaAssets).set({ mp4Status: null }).where(eq(schema.mediaAssets.id, id))
    await rendition("video.asset.static_rendition.ready", id, {
      name: "720p.mp4",
      resolution: "720p",
      status: "ready",
    })
    expect((await status(id)).row).toMatchObject({ mp4Status: null, mp4Name: null })
  })
})
