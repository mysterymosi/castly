import { schema, type Db } from "@workspace/db"
import { and, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm"
import type { PgBoss } from "pg-boss"
import { z } from "zod"

import { interestHeadline } from "../interest/copy.js"
import { receiptQueue, type PushJob } from "./fanout.js"

const {
  deviceTokens,
  users,
  interests,
  bookerProfiles,
  roles,
  projects,
  matches,
  messages,
  conversationParticipants,
  notificationPrefs,
} = schema
const endpoint = "https://exp.host/--/api/v2/push"
const result = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), id: z.string().optional() }),
  z.object({
    status: z.literal("error"),
    details: z.object({ error: z.string().optional() }).optional(),
  }),
])

export type ReceiptJob = {
  ticketId: string
  deviceId: string
  lastSeenAt: string
}

async function requestExpo(
  operation: "send" | "getReceipts",
  payload: object
): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  const accessToken = process.env.EXPO_PUSH_ACCESS_TOKEN
  if (accessToken) headers.authorization = `Bearer ${accessToken}`

  const response = await fetch(`${endpoint}/${operation}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`Expo Push ${operation} returned HTTP ${response.status}`)
  }
  if (!response.ok) {
    console.error(
      `Expo Push ${operation} rejected the request (HTTP ${response.status})`
    )
    return null
  }
  return response.json()
}

async function notificationBody(db: Db, job: PushJob) {
  if (job.digestCount !== undefined) {
    return job.digestCount === 1
      ? "A role brief was shared with you this week."
      : `${job.digestCount} role briefs were shared with you this week.`
  }
  switch (job.category) {
    case "interest": {
      const [row] = await db
        .select({
          vertical: bookerProfiles.vertical,
          projectName: projects.name,
        })
        .from(interests)
        .innerJoin(
          bookerProfiles,
          eq(bookerProfiles.userId, interests.bookerId)
        )
        .leftJoin(roles, eq(roles.id, interests.roleId))
        .leftJoin(projects, eq(projects.id, roles.projectId))
        .where(
          and(
            eq(interests.id, job.subjectId),
            eq(interests.talentId, job.userId),
            eq(interests.status, "pending"),
            gt(interests.expiresAt, new Date())
          )
        )
      return row ? interestHeadline(row.vertical, row.projectName) : null
    }
    case "match": {
      const [row] = await db
        .select({ id: matches.id })
        .from(matches)
        .where(
          and(
            eq(matches.id, job.subjectId),
            or(
              eq(matches.bookerId, job.userId),
              eq(matches.talentId, job.userId)
            )
          )
        )
      return row ? "You have a new match." : null
    }
    case "brief": {
      const [row] = await db
        .select({ id: matches.id })
        .from(matches)
        .where(
          and(
            eq(matches.id, job.subjectId),
            eq(matches.talentId, job.userId),
            isNotNull(matches.brief)
          )
        )
      return row ? "A role brief was shared with you." : null
    }
    case "message": {
      const [row] = await db
        .select({ id: messages.id })
        .from(messages)
        .innerJoin(
          conversationParticipants,
          and(
            eq(
              conversationParticipants.conversationId,
              messages.conversationId
            ),
            eq(conversationParticipants.userId, job.userId)
          )
        )
        .where(
          and(
            eq(messages.id, job.subjectId),
            isNull(messages.deletedAt),
            or(
              isNull(conversationParticipants.lastReadAt),
              sql`${messages.createdAt} > ${conversationParticipants.lastReadAt}`
            )
          )
        )
      return row ? "You have a new message." : null
    }
  }
}

async function retireDevice(db: Db, deviceId: string, lastSeenAt: string) {
  await db
    .delete(deviceTokens)
    .where(
      and(
        eq(deviceTokens.id, deviceId),
        sql`date_trunc('milliseconds', ${deviceTokens.lastSeenAt}) = ${lastSeenAt}::timestamptz`
      )
    )
}

export async function deliverPush(db: Db, boss: PgBoss, job: PushJob) {
  const [device] = await db
    .select({ token: deviceTokens.token, lastSeenAt: deviceTokens.lastSeenAt })
    .from(deviceTokens)
    .innerJoin(users, eq(users.id, deviceTokens.userId))
    .leftJoin(
      notificationPrefs,
      and(
        eq(notificationPrefs.userId, users.id),
        eq(notificationPrefs.category, job.category)
      )
    )
    .where(
      and(
        eq(deviceTokens.id, job.deviceId),
        eq(users.id, job.userId),
        eq(users.status, "active"),
        or(
          isNull(notificationPrefs.enabled),
          eq(notificationPrefs.enabled, true)
        )
      )
    )
  if (!device) return
  const body = await notificationBody(db, job)
  if (!body) return

  const response = await requestExpo("send", {
    to: device.token,
    title: "Castly",
    body,
    channelId: "castly",
    sound: "default",
    ttl: 86_400,
    data:
      job.digestCount === undefined
        ? { category: job.category, subjectId: job.subjectId }
        : { category: "brief" },
  })
  if (response === null) return
  const { data: ticket } = z.object({ data: result }).parse(response)
  const lastSeenAt = device.lastSeenAt.toISOString()
  if (ticket.status === "error") {
    const error = ticket.details?.error
    if (error === "DeviceNotRegistered")
      await retireDevice(db, job.deviceId, lastSeenAt)
    else if (error === "MessageRateExceeded")
      throw new Error("Expo Push device rate exceeded")
    else console.error("Expo Push rejected a notification", error ?? "unknown")
    return
  }
  if (!ticket.id) throw new Error("Expo Push did not return a ticket ID")
  await boss.sendAfter(
    receiptQueue,
    {
      ticketId: ticket.id,
      deviceId: job.deviceId,
      lastSeenAt,
    } satisfies ReceiptJob,
    null,
    15 * 60
  )
}

export async function checkReceipt(db: Db, job: ReceiptJob) {
  const response = await requestExpo("getReceipts", { ids: [job.ticketId] })
  if (response === null) return
  const { data } = z
    .object({ data: z.record(z.string(), result) })
    .parse(response)
  const receipt = data[job.ticketId]
  if (!receipt) throw new Error("Expo Push receipt is pending")
  if (receipt.status === "ok") return
  const error = receipt.details?.error
  if (error === "DeviceNotRegistered")
    await retireDevice(db, job.deviceId, job.lastSeenAt)
  else
    console.error(
      "Expo Push provider rejected a notification",
      error ?? "unknown"
    )
}
