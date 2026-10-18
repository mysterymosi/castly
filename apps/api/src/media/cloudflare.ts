import { MediaError } from "./errors.js"

type DirectUploadResult = {
  uploadUrl: string
  providerRef: string
  uploadMethod: "POST"
  uploadHeaders: Record<string, string>
}

function cfHeaders() {
  const token = process.env.CF_API_TOKEN
  if (!token) throw new MediaError("invalid_kind", "Cloudflare is not configured")
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

function accountPath(suffix: string) {
  const accountId = process.env.CF_ACCOUNT_ID
  if (!accountId) throw new MediaError("invalid_kind", "CF_ACCOUNT_ID is not set")
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}${suffix}`
}

export async function createCloudflareImageUpload(input: {
  mediaId: string
  contentType: string
}): Promise<DirectUploadResult> {
  const form = new FormData()
  form.append("requireSignedURLs", "false")
  form.append("metadata", JSON.stringify({ castlyMediaId: input.mediaId }))
  const response = await fetch(accountPath("/images/v2/direct_upload"), {
    method: "POST",
    headers: { Authorization: process.env.CF_API_TOKEN ? `Bearer ${process.env.CF_API_TOKEN}` : "" },
    body: form,
  })
  const body = (await response.json()) as {
    success?: boolean
    result?: { id: string; uploadURL: string }
    errors?: { message: string }[]
  }
  if (!response.ok || !body.success || !body.result) {
    throw new MediaError(
      "invalid_kind",
      body.errors?.[0]?.message ?? "Cloudflare Images direct upload failed"
    )
  }
  return {
    uploadUrl: body.result.uploadURL,
    providerRef: body.result.id,
    uploadMethod: "POST",
    uploadHeaders: { "Content-Type": input.contentType },
  }
}
