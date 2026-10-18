import Mux from "@mux/mux-node"

export function muxConfigured() {
  return Boolean(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET)
}

export function muxClient() {
  const tokenId = process.env.MUX_TOKEN_ID
  const tokenSecret = process.env.MUX_TOKEN_SECRET
  if (!tokenId || !tokenSecret) {
    throw new Error("MUX_TOKEN_ID and MUX_TOKEN_SECRET are not set")
  }
  return new Mux({ tokenId, tokenSecret })
}

export function muxCorsOrigin() {
  return process.env.MUX_CORS_ORIGIN?.trim() || "*"
}
