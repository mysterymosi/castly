import NetInfo from "@react-native-community/netinfo"
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query"
import { TRPCClientError } from "@trpc/client"
import { createTRPCOptionsProxy, type TRPCOptionsProxy } from "@trpc/tanstack-react-query"
import type { AppRouter } from "api/router"
import { AppState, Platform } from "react-native"

import { trpc } from "@/trpc/client"

/** 4xx means the request itself is wrong (auth, permissions, missing, invalid): retrying won't help. */
function isClientError(error: unknown) {
  if (!(error instanceof TRPCClientError)) return false
  const status: unknown = error.data?.httpStatus
  return typeof status === "number" && status >= 400 && status < 500
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
    },
    mutations: {
      retry: false,
      // An offline save fails right away with its message instead of waiting silently to resume.
      networkMode: "always",
    },
  },
})

/**
 * Query and mutation options for every procedure, built on the existing vanilla client (same
 * links, headers, token, and base URL). A singleton rather than a React context, so session code
 * and other non-component callers can read and write the same cache keys.
 */
export const trpcQuery: TRPCOptionsProxy<AppRouter> = createTRPCOptionsProxy<AppRouter>({
  client: trpc,
  queryClient,
})

// React Native has no window focus or online events: drive TanStack's managers from the app's
// foreground state and NetInfo. Web keeps TanStack's built-in browser listeners.
if (Platform.OS !== "web") {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (state) => {
      setFocused(state === "active")
    })
    return () => subscription.remove()
  })

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // `null` means "not determined yet" for both fields; only a definite false is offline.
      setOnline(state.isConnected !== false && state.isInternetReachable !== false)
    }),
  )
}
