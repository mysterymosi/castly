import { describe, expect, it } from "vitest"

import { deliverOtp } from "./termii.js"

const config = {
  apiKey: "test-key",
  senderId: "Castly",
  baseUrl: "https://termii.test",
  to: "+2348031234567",
  otp: "123456",
}

describe("deliverOtp", () => {
  it("stops after WhatsApp accepts the code", async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { channel: string; sms: string }
      calls.push(body.channel)
      expect(body.sms).toBe("123456")
      return new Response("{}", { status: 200 })
    }
    await expect(deliverOtp({ ...config, fetchImpl })).resolves.toBe("whatsapp")
    expect(calls).toEqual(["whatsapp_otp"])
  })

  it("falls back to transactional SMS when WhatsApp fails", async () => {
    const calls: { channel: string; sms: string }[] = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { channel: string; sms: string }
      calls.push(body)
      return new Response("no", { status: body.channel === "whatsapp_otp" ? 400 : 200 })
    }
    await expect(deliverOtp({ ...config, fetchImpl })).resolves.toBe("sms")
    expect(calls[1]).toEqual({
      api_key: "test-key",
      to: "2348031234567",
      from: "Castly",
      sms: "Your Castly code is 123456",
      type: "plain",
      channel: "dnd",
    })
  })
})
