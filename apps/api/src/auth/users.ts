import { eq } from "drizzle-orm"
import { schema, type Db } from "@workspace/db"

const { userModes, users } = schema

export async function findUserByEmail(db: Db, email: string) {
  const [user] = await db
    .select({ id: users.id, dateOfBirth: users.dateOfBirth })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  return user ?? null
}

export async function recordSignup(
  db: Db,
  input: { id: string; email: string; dateOfBirth?: string },
) {
  const existing = await findUserByEmail(db, input.email)
  // A birthday is stored once. Sign-in omits it, and a later sign-up must not replace it.
  const dateOfBirth = existing?.dateOfBirth ? undefined : input.dateOfBirth
  await db
    .insert(users)
    .values({
      id: input.id,
      email: input.email,
      dateOfBirth,
      lastActiveAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: input.email,
        lastActiveAt: new Date(),
        ...(dateOfBirth ? { dateOfBirth } : {}),
      },
    })
}

export async function listModes(db: Db, userId: string) {
  const rows = await db
    .select({ mode: userModes.mode })
    .from(userModes)
    .where(eq(userModes.userId, userId))
  return rows.map((row) => row.mode)
}

export async function enableUserMode(db: Db, userId: string, mode: "talent" | "booker") {
  await db.insert(userModes).values({ userId, mode }).onConflictDoNothing()
  return listModes(db, userId)
}

export async function readMe(db: Db, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      dateOfBirth: users.dateOfBirth,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) return null
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId))
  return { ...user, modes: await listModes(db, userId) }
}
