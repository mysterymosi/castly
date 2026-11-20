export type PushStatus = "unavailable" | "enable" | "settings" | "registered"

export async function syncPushDevice(_ask = false): Promise<PushStatus> {
  return "unavailable"
}

export function watchPushDevice(
  _onStatus: (status: PushStatus) => void
): () => void {
  return () => {}
}

export async function revokePushDevice() {}
