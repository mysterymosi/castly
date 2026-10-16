export type TermiiChannel = "whatsapp" | "sms"

type SendInput = {
  to: string
  otp: string
  apiKey: string
  senderId: string
  baseUrl: string
  fetchImpl?: typeof fetch
}

type TermiiResponse = { ok: boolean }

async function postTermii(
  fetchImpl: typeof fetch,
  baseUrl: string,
  body: Record<string, string>
): Promise<TermiiResponse> {
  const response = await fetchImpl(`${baseUrl}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { ok: response.ok }
}

/** WhatsApp OTP first. Transactional SMS (DND route) only if WhatsApp fails. */
export async function deliverOtp(input: SendInput): Promise<TermiiChannel> {
  const fetchImpl = input.fetchImpl ?? fetch
  const to = input.to.replace(/^\+/, "")
  const whatsapp = await postTermii(fetchImpl, input.baseUrl, {
    api_key: input.apiKey,
    to,
    from: input.senderId,
    sms: input.otp,
    type: "plain",
    channel: "whatsapp_otp",
  })
  if (whatsapp.ok) return "whatsapp"

  const sms = await postTermii(fetchImpl, input.baseUrl, {
    api_key: input.apiKey,
    to,
    from: input.senderId,
    sms: `Your Castly code is ${input.otp}`,
    type: "plain",
    channel: "dnd",
  })
  if (!sms.ok) throw new Error("Termii could not deliver the OTP")
  return "sms"
}

export function termiiConfig() {
  const apiKey = process.env.TERMII_API_KEY
  if (!apiKey) throw new Error("TERMII_API_KEY is not set")
  return {
    apiKey,
    senderId: process.env.TERMII_SENDER_ID || "testing-sms",
    baseUrl: process.env.TERMII_BASE_URL || "https://api.ng.termii.com",
  }
}
