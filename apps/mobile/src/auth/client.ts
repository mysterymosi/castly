import { invoke, trpc } from "@/trpc/client"

export { getAccessToken, setAccessToken } from "@/auth/token"

export const authApi = {
  requestOtp(input: Parameters<typeof trpc.auth.requestOtp.mutate>[0]) {
    return invoke(() => trpc.auth.requestOtp.mutate(input))
  },
  verifyOtp(input: Parameters<typeof trpc.auth.verifyOtp.mutate>[0]) {
    return invoke(() => trpc.auth.verifyOtp.mutate(input))
  },
  refresh(refreshToken: string) {
    return invoke(() => trpc.auth.refresh.mutate({ refreshToken }))
  },
  me() {
    return invoke(() => trpc.auth.me.query())
  },
  enableMode(mode: Parameters<typeof trpc.auth.enableMode.mutate>[0]["mode"]) {
    return invoke(() => trpc.auth.enableMode.mutate({ mode }))
  },
}
