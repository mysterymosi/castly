import { createHash, randomBytes } from "node:crypto"

export function newUploadSecret() {
  return randomBytes(24).toString("base64url")
}

export function hashUploadSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex")
}
