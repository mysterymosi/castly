import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { eq, inArray } from "drizzle-orm"
import { PgBoss } from "pg-boss"
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest"

import { db } from "../db.js"
import {
  booker,
  caller,
  cleanupDeckFixtures,
  liveTalent,
  newUser,
  role,
  world,
} from "../test/deck-fixtures.js"
import { recordPush } from "./events.js"
import { checkReceipt, deliverPush, type ReceiptJob } from "./expo.js"
import { fanoutPush, pushQueue, receiptQueue, type PushJob } from "./fanout.js"
import { createDeliveryQueues } from "./worker.js"

const boss = new PgBoss({
  connectionString: process.env.DATABASE_API_URL,
  schema: "castly_jobs",
  createSchema: false,
  schedule: false,
  supervise: false,
})

beforeAll(async () => {
  await boss.start()
  await createDeliveryQueues(boss)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await cleanupDeckFixtures()
})

afterAll(async () => {
  await boss.stop()
})

it("records match-loop events once and sends a pending interest to each registered device", async () => {
  const w = await world()
  const talentId = await liveTalent(w, "push-talent")
  const talent = caller(talentId)
  await talent.auth.enableMode({ mode: "talent" })
  const b = await booker(w, "push-booker")
  const roleId = await role(b.userId, {
    categoryId: w.categoryId,
    brief: "A written brief",
  })
  const token = `ExpoPushToken[${randomUUID()}]`
  const otherToken = `ExponentPushToken[${randomUUID()}]`
  await talent.notification.registerDevice({ token, platform: "ios" })
  await talent.notification.registerDevice({
    token: otherToken,
    platform: "android",
  })

  const { sessionId } = await b.api.deck.start({ roleId })
  const { cards } = await b.api.deck.next({ sessionId, limit: 20 })
  const position = cards.find(
    (card) => card.talent.profile.userId === talentId
  )!.position
  await b.api.deck.swipe({ sessionId, position, direction: "interest" })
  const [interest] = await db
    .select()
    .from(schema.interests)
    .where(eq(schema.interests.talentId, talentId))
  const interestId = interest!.id
  await Promise.all([fanoutPush(db, boss), fanoutPush(db, boss)])
  const jobs = await boss.fetch<PushJob>(pushQueue, { batchSize: 10 })
  expect(jobs.map(({ data }) => data)).toHaveLength(2)
  expect(
    jobs.every(
      ({ data }) => data.subjectId === interestId && data.userId === talentId
    )
  ).toBe(true)
  await fanoutPush(db, boss)
  expect(await boss.fetch(pushQueue)).toHaveLength(0)

  const fetchExpo = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ data: { status: "ok", id: "ticket" } })
    )
    .mockResolvedValueOnce(
      Response.json({
        data: { status: "error", details: { error: "DeviceNotRegistered" } },
      })
    )
  vi.stubGlobal("fetch", fetchExpo)
  for (const job of jobs) {
    await deliverPush(db, boss, job.data)
    await boss.complete(pushQueue, job.id)
  }
  const payloads = fetchExpo.mock.calls.map(([, request]) =>
    JSON.parse(String(request?.body))
  )
  expect(payloads.map(({ to }) => to)).toEqual(
    expect.arrayContaining([token, otherToken])
  )
  expect(payloads[0]).toMatchObject({
    body: "A casting director is interested in you for Lagos Nights",
    data: { category: "interest", subjectId: interestId },
  })
  const [remaining] = await db
    .select()
    .from(schema.deviceTokens)
    .where(eq(schema.deviceTokens.userId, talentId))
  expect(remaining?.token).toBe(payloads[0].to)

  const [receipt] = await boss.findJobs<ReceiptJob>(receiptQueue, {
    data: { deviceId: remaining!.id },
  })
  expect(receipt?.data.ticketId).toBe("ticket")
  fetchExpo.mockResolvedValueOnce(
    Response.json({
      data: {
        ticket: { status: "error", details: { error: "DeviceNotRegistered" } },
      },
    })
  )
  await checkReceipt(db, receipt!.data)
  await boss.deleteJob(receiptQueue, receipt!.id)
  expect(
    await db
      .select()
      .from(schema.deviceTokens)
      .where(eq(schema.deviceTokens.userId, talentId))
  ).toHaveLength(0)

  const { matchId, conversationId } = await talent.interest.accept({
    interestId,
  })
  await talent.interest.accept({ interestId })
  const messageInput = { conversationId, body: "Hello", clientId: randomUUID() }
  const message = await b.api.message.send(messageInput)
  await b.api.message.send(messageInput)
  await b.api.match.attachBrief({ matchId })
  await b.api.match.attachBrief({ matchId })
  const events = await db
    .select()
    .from(schema.pushNotifications)
    .where(inArray(schema.pushNotifications.userId, [b.userId, talentId]))
  expect(events).toHaveLength(5)
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        category: "match",
        subjectId: matchId,
        userId: b.userId,
      }),
      expect.objectContaining({
        category: "match",
        subjectId: matchId,
        userId: talentId,
      }),
      expect.objectContaining({
        category: "message",
        subjectId: message.id,
        userId: talentId,
      }),
      expect.objectContaining({
        category: "brief",
        subjectId: matchId,
        userId: talentId,
      }),
    ])
  )
  await fanoutPush(db, boss)
  expect(await boss.fetch(pushQueue)).toHaveLength(0)
})

it("applies disabled categories and frequency caps and groups due briefs in one digest", async () => {
  const userId = await newUser("push-prefs")
  const api = caller(userId)
  const token = `ExpoPushToken[${randomUUID()}]`
  const previousOwner = caller(await newUser("push-previous-owner"))
  await previousOwner.notification.registerDevice({ platform: "ios", token })
  await api.notification.registerDevice({ platform: "ios", token })
  await previousOwner.notification.unregisterDevice({ token })
  const [registered] = await db
    .select()
    .from(schema.deviceTokens)
    .where(eq(schema.deviceTokens.token, token))
  expect(registered?.userId).toBe(userId)
  const preferences = await api.notification.preferences()
  expect(preferences.find((item) => item.category === "brief")).toMatchObject({
    enabled: true,
    cadence: "weekly",
  })
  await api.notification.setPreference({
    category: "interest",
    cadence: "immediate",
    enabled: false,
    frequencyCap: null,
  })
  await api.notification.setPreference({
    category: "message",
    cadence: "immediate",
    enabled: true,
    frequencyCap: 1,
  })

  const message = randomUUID()
  await db.transaction(async (tx) => {
    await recordPush(tx, "interest", randomUUID(), [userId])
    await recordPush(tx, "message", message, [userId, userId])
    await recordPush(tx, "message", randomUUID(), [userId])
    await recordPush(tx, "brief", randomUUID(), [userId])
    await recordPush(tx, "brief", randomUUID(), [userId])
  })

  await fanoutPush(db, boss)
  const immediate = await boss.fetch<PushJob>(pushQueue, { batchSize: 10 })
  expect(immediate.map(({ data }) => data)).toEqual([
    {
      category: "message",
      subjectId: message,
      userId,
      deviceId: registered!.id,
    },
  ])
  await boss.complete(pushQueue, immediate[0]!.id)

  const events = await db
    .select()
    .from(schema.pushNotifications)
    .where(eq(schema.pushNotifications.userId, userId))
  const digestAt = events.find((event) => event.category === "brief")!.digestAt!
  await fanoutPush(db, boss, digestAt)
  const digest = await boss.fetch<PushJob>(pushQueue, { batchSize: 10 })
  expect(digest.map(({ data }) => data)).toEqual([
    expect.objectContaining({ category: "brief", digestCount: 2, userId }),
  ])
  await boss.complete(pushQueue, digest[0]!.id)
})
