import { randomUUID } from "node:crypto"

import { schema } from "@workspace/db"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { db } from "../db.js"
import { deleteAuthUser, seedAuthUser } from "../test/seed-auth-user.js"
import { createContext } from "../trpc/context.js"
import { appRouter } from "../trpc/router.js"

const adult = "1990-01-01"
const seededUserIds: string[] = []
const createdCityIds: string[] = []

/** A caller built from a real request, so any header a client could send is in play. */
function caller(userId: string, headers: Record<string, string> = {}) {
  const request = new Request("http://api.test/trpc", {
    headers: { authorization: "Bearer test-token", "x-forwarded-for": "203.0.113.93", ...headers },
  })
  return appRouter.createCaller({
    ...createContext(request),
    verifyAccessToken: async () => ({ userId }),
  })
}

async function newUser(label: string) {
  const userId = await seedAuthUser(label, adult)
  seededUserIds.push(userId)
  return userId
}

async function createCity(name: string) {
  const [city] = await db
    .insert(schema.cities)
    .values({ slug: `booker-${name.toLowerCase()}-${randomUUID().slice(0, 8)}`, name })
    .returning({ id: schema.cities.id })
  if (!city) throw new Error("city insert failed")
  createdCityIds.push(city.id)
  return city.id
}

describe("booker profile", () => {
  afterEach(async () => {
    while (seededUserIds.length > 0) {
      const id = seededUserIds.pop()
      if (id) await deleteAuthUser(id)
    }
    while (createdCityIds.length > 0) {
      const id = createdCityIds.pop()
      if (id) await db.delete(schema.cities).where(eq(schema.cities.id, id))
    }
  })

  it("refuses booker procedures without the user_modes row, whatever the client claims", async () => {
    const userId = await newUser("booker-no-mode")
    const spoofed = caller(userId, { mode: "booker", "x-mode": "booker", "x-castly-mode": "booker" })
    await expect(spoofed.booker.getProfile()).rejects.toMatchObject({ code: "FORBIDDEN" })

    // A talent is not a booker either.
    await spoofed.auth.enableMode({ mode: "talent" })
    await expect(spoofed.booker.getProfile()).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("persists casting director + Lagos after booker mode is enabled", async () => {
    const userId = await newUser("booker-setup")
    const lagos = await createCity("Lagos")
    const api = caller(userId)
    await api.auth.enableMode({ mode: "booker" })

    const empty = await api.booker.getProfile()
    expect(empty.profile).toBeNull()
    expect(empty.cities.map((c) => c.id)).toContain(lagos)

    const saved = await api.booker.updateProfile({
      vertical: "casting_director",
      companyName: "  ",
      cityId: lagos,
      typicalProjectTypes: ["film", "commercial"],
    })
    expect(saved.profile).toMatchObject({
      userId,
      vertical: "casting_director",
      companyName: null,
      cityId: lagos,
      cityName: "Lagos",
      typicalProjectTypes: ["film", "commercial"],
      verificationTier: "phone",
      verificationRequestedAt: null,
    })

    // Read back in a fresh request: it persisted.
    const reread = await caller(userId).booker.getProfile()
    expect(reread.profile).toEqual(saved.profile)

    const edited = await api.booker.updateProfile({
      vertical: "producer",
      companyName: "Lagoon Pictures",
      cityId: lagos,
      typicalProjectTypes: ["tv"],
    })
    expect(edited.profile).toMatchObject({
      vertical: "producer",
      companyName: "Lagoon Pictures",
      typicalProjectTypes: ["tv"],
    })
  })

  it("rejects an unknown city and an empty project-type list", async () => {
    const userId = await newUser("booker-invalid")
    const api = caller(userId)
    await api.auth.enableMode({ mode: "booker" })
    const lagos = await createCity("Lagos")

    await expect(
      api.booker.updateProfile({
        vertical: "director",
        companyName: null,
        cityId: randomUUID(),
        typicalProjectTypes: ["music_video"],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      api.booker.updateProfile({
        vertical: "director",
        companyName: null,
        cityId: lagos,
        typicalProjectTypes: [],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("records a verification request once without changing the tier", async () => {
    const userId = await newUser("booker-verify")
    const lagos = await createCity("Lagos")
    const api = caller(userId)
    await api.auth.enableMode({ mode: "booker" })

    await expect(api.booker.submitVerification()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    })

    await api.booker.updateProfile({
      vertical: "brand_or_agency",
      companyName: "Bright Ads",
      cityId: lagos,
      typicalProjectTypes: ["campaign"],
    })
    const first = await api.booker.submitVerification()
    expect(first.profile?.verificationRequestedAt).toBeTruthy()
    expect(first.profile?.verificationTier).toBe("phone")

    const again = await api.booker.submitVerification()
    expect(again.profile?.verificationRequestedAt).toBe(first.profile?.verificationRequestedAt)
  })
})
