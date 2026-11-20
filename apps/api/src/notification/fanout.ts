import { schema, type Db } from "@workspace/db"
import { and, asc, count, eq, gt, isNull, lte, or, sql } from "drizzle-orm"
import { fromDrizzle, type PgBoss } from "pg-boss"

import { defaultPreference, type NotificationCategory } from "./events.js"

export const fanoutQueue = "notification-fanout"
export const pushQueue = "notification-push"
export const receiptQueue = "notification-receipt"

export type PushJob = {
  userId: string
  category: NotificationCategory
  subjectId: string
  deviceId: string
  digestCount?: number
}

const { deviceTokens, notificationPrefs, pushNotifications, users } = schema
const dayMs = 24 * 60 * 60 * 1000

export async function fanoutPush(db: Db, boss: PgBoss, now = new Date()) {
  const pending = isNull(pushNotifications.processedAt)
  const candidates = await db
    .select({ event: pushNotifications })
    .from(pushNotifications)
    .leftJoin(
      notificationPrefs,
      and(
        eq(notificationPrefs.userId, pushNotifications.userId),
        eq(notificationPrefs.category, pushNotifications.category)
      )
    )
    .where(
      and(
        pending,
        or(
          eq(notificationPrefs.enabled, false),
          isNull(pushNotifications.digestAt),
          eq(notificationPrefs.cadence, "immediate"),
          lte(pushNotifications.digestAt, now)
        )
      )
    )
    .orderBy(asc(pushNotifications.id))
    .limit(100)

  for (const { event } of candidates) {
    const { id, userId, category, subjectId } = event
    await db.transaction(async (tx) => {
      // Serializes the cap and digest across workers without locking the user's application writes.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"push:"} || ${userId} || ${category}, 0))`
      )
      const [row] = await tx
        .select({ status: users.status, preference: notificationPrefs })
        .from(pushNotifications)
        .innerJoin(users, eq(users.id, userId))
        .leftJoin(
          notificationPrefs,
          and(
            eq(notificationPrefs.userId, userId),
            eq(notificationPrefs.category, category)
          )
        )
        .where(and(eq(pushNotifications.id, id), pending))
      if (!row) return

      const preference = row.preference ?? defaultPreference(category)
      const weekly = preference.cadence === "weekly"
      const bucket = weekly
        ? and(
            eq(pushNotifications.userId, userId),
            eq(pushNotifications.category, category),
            preference.enabled
              ? lte(pushNotifications.digestAt, now)
              : undefined
          )
        : eq(pushNotifications.id, id)
      const processed = await tx
        .update(pushNotifications)
        .set({ processedAt: now })
        .where(and(bucket, pending))
        .returning({ id: pushNotifications.id })
      if (
        processed.length === 0 ||
        !preference.enabled ||
        row.status !== "active"
      )
        return

      if (preference.frequencyCap !== null) {
        const [recent] = await tx
          .select({ total: count() })
          .from(pushNotifications)
          .where(
            and(
              eq(pushNotifications.userId, userId),
              eq(pushNotifications.category, category),
              gt(pushNotifications.queuedAt, new Date(now.getTime() - dayMs))
            )
          )
        if (recent!.total >= preference.frequencyCap) return
      }

      const devices = await tx
        .select({ id: deviceTokens.id })
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, userId))
      if (devices.length === 0) return

      const transaction = fromDrizzle(tx, sql)
      await boss.insert(
        pushQueue,
        devices.map(({ id: deviceId }) => ({
          data: {
            userId,
            category,
            subjectId,
            deviceId,
            ...(weekly ? { digestCount: processed.length } : {}),
          } satisfies PushJob,
        })),
        { db: transaction }
      )
      await tx
        .update(pushNotifications)
        .set({ queuedAt: now })
        .where(eq(pushNotifications.id, id))
    })
  }
}
