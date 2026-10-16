import { Webhook } from "standardwebhooks"

import { deliverOtp, termiiConfig } from "../auth/termii.js"

type SmsHookPayload = {
  user?: { phone?: string }
  sms?: { otp?: string }
}

function hookSecret() {
  const raw = process.env.SEND_SMS_HOOK_SECRETS
  if (!raw) throw new Error("SEND_SMS_HOOK_SECRETS is not set")
  const first = raw.split("|")[0] ?? raw
  return first.replace(/^v1,whsec_/, "")
}

export async function handleSendSms(rawBody: string, headers: Record<string, string>) {
  const verified = new Webhook(hookSecret()).verify(rawBody, headers) as SmsHookPayload
  const phone = verified.user?.phone
  const otp = verified.sms?.otp
  if (!phone || !otp) throw new Error("Send SMS hook payload is missing a phone or OTP")
  const config = termiiConfig()
  await deliverOtp({ ...config, to: phone, otp })
}
