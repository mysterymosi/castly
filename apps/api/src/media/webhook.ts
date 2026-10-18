import { Webhook } from "standardwebhooks"

import { mediaWebhookSecret } from "./config.js"
import { mediaProviderReadyEventSchema } from "./provider-events.js"

export function verifyMediaProviderWebhook(rawBody: string, headers: Record<string, string>) {
  const verified = new Webhook(mediaWebhookSecret()).verify(rawBody, headers)
  return mediaProviderReadyEventSchema.parse(verified)
}
