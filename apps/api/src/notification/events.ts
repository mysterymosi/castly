import { schema, type Db } from "@workspace/db"

export type NotificationCategory =
  (typeof schema.notificationCategory.enumValues)[number]
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

export const categories = schema.notificationCategory.enumValues

export function defaultPreference(category: NotificationCategory) {
  return {
    category,
    enabled: true,
    cadence:
      category === "brief" ? ("weekly" as const) : ("immediate" as const),
    frequencyCap: category === "message" ? 20 : null,
  }
}

// Monday at 09:00 in Lagos (UTC+1 year-round).
export function nextDigest(now: Date) {
  const next = new Date(now)
  next.setUTCHours(8, 0, 0, 0)
  next.setUTCDate(next.getUTCDate() + ((8 - next.getUTCDay()) % 7))
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7)
  return next
}

export async function recordPush(
  tx: Tx,
  category: NotificationCategory,
  subjectId: string,
  userIds: string[]
) {
  if (userIds.length === 0) return
  const digestAt = category === "brief" ? nextDigest(new Date()) : null
  await tx
    .insert(schema.pushNotifications)
    .values(
      userIds.map((userId) => ({ userId, category, subjectId, digestAt }))
    )
    .onConflictDoNothing({
      target: [
        schema.pushNotifications.userId,
        schema.pushNotifications.category,
        schema.pushNotifications.subjectId,
      ],
    })
}
