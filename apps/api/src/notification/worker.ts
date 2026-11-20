import type { Db } from "@workspace/db"
import { PgBoss } from "pg-boss"

import { expireInterests } from "../interest/service.js"
import { syncPreparingMp4s } from "../media/mux-mp4.js"
import { checkReceipt, deliverPush, type ReceiptJob } from "./expo.js"
import {
  fanoutPush,
  fanoutQueue,
  pushQueue,
  receiptQueue,
  type PushJob,
} from "./fanout.js"

const expiryQueue = "interest-expiry"
/** Chat video MP4s Mux is still making, for when its webhook doesn't reach us. */
const mp4Queue = "media-mp4-sync"

export async function createDeliveryQueues(boss: PgBoss) {
  await boss.createQueue(pushQueue, {
    retryLimit: 4,
    retryDelay: 30,
    retryBackoff: true,
    retentionSeconds: 86_400,
  })
  await boss.createQueue(receiptQueue, {
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
  })
}

export async function startNotificationWorker(db: Db) {
  const boss = new PgBoss({
    connectionString: process.env.DATABASE_API_URL,
    schema: "castly_jobs",
    createSchema: false, // Migration 0021 grants castly_api CREATE within this schema.
    max: 4,
  })
  boss.on("error", (error) =>
    console.error("pg-boss worker error", error.message)
  )
  await boss.start()

  await boss.createQueue(fanoutQueue, { policy: "singleton" })
  await boss.createQueue(expiryQueue, { policy: "singleton" })
  await boss.createQueue(mp4Queue, { policy: "singleton" })
  await createDeliveryQueues(boss)

  await boss.work(fanoutQueue, async () => {
    await fanoutPush(db, boss)
  })
  await boss.work(expiryQueue, async () => {
    await expireInterests(db)
  })
  await boss.work(mp4Queue, async () => {
    await syncPreparingMp4s(db)
  })
  await boss.work<PushJob>(
    pushQueue,
    { localConcurrency: 4 },
    async ([job]) => {
      if (job) await deliverPush(db, boss, job.data)
    }
  )
  await boss.work<ReceiptJob>(
    receiptQueue,
    { localConcurrency: 2 },
    async ([job]) => {
      if (job) await checkReceipt(db, job.data)
    }
  )

  await boss.schedule(fanoutQueue, "* * * * *")
  await boss.schedule(expiryQueue, "*/15 * * * *")
  await boss.schedule(mp4Queue, "* * * * *")
  return boss
}
