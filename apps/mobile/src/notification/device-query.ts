import { queryOptions } from "@tanstack/react-query"

import { syncPushDevice } from "./push"

export function pushDeviceOptions(userId: string) {
  return queryOptions({
    queryKey: ["push-device", userId],
    queryFn: () => syncPushDevice(),
    refetchOnWindowFocus: false,
  })
}
