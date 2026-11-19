import NetInfo from "@react-native-community/netinfo"
import { requireOptionalNativeModule } from "expo"
import Constants, { ExecutionEnvironment } from "expo-constants"
import type {
  DevicePushToken,
  NotificationPermissionsStatus,
} from "expo-notifications"
import * as SecureStore from "expo-secure-store"
import { AppState, Platform } from "react-native"

import { trpc } from "@/trpc/client"

type PushStatus = "unavailable" | "enable" | "settings" | "registered"

const tokenKey = "castly.pushToken"
const projectId =
  (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
  Constants.easConfig?.projectId
const supported =
  !!projectId &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
  !!requireOptionalNativeModule("ExpoPushTokenManager")
const platform = Platform.OS === "ios" ? "ios" : "android"
let generation = 0
let signingOut = false
let syncing: { ask: boolean; promise: Promise<PushStatus> } | undefined
let pendingWrite: Promise<unknown> | undefined
let notifications: Promise<typeof import("expo-notifications")> | undefined

function loadNotifications() {
  // Older development builds can still load the app from Metro without this module.
  return (notifications ??= import("expo-notifications").then((module) => {
    module.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    })
    return module
  }))
}

async function writeDevice(write: (signal: AbortSignal) => Promise<unknown>) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  const pending = write(controller.signal).finally(() => clearTimeout(timeout))
  pendingWrite = pending
  try {
    await pending
  } finally {
    if (pendingWrite === pending) pendingWrite = undefined
  }
}

export function syncPushDevice(
  ask = false,
  devicePushToken?: DevicePushToken
): Promise<PushStatus> {
  if (!supported || signingOut) return Promise.resolve("unavailable")
  if (syncing) {
    if (!ask || syncing.ask) return syncing.promise
    const requestPermission = () => syncPushDevice(true)
    return syncing.promise.then(requestPermission, requestPermission)
  }
  const promise = register(ask, generation, devicePushToken).finally(() => {
    if (syncing?.promise === promise) syncing = undefined
  })
  syncing = { ask, promise }
  return promise
}

async function register(
  ask: boolean,
  attempt: number,
  devicePushToken?: DevicePushToken
): Promise<PushStatus> {
  const Notifications = await loadNotifications()
  if (attempt !== generation) return "unavailable"
  const canReceive = (permissions: NotificationPermissionsStatus) =>
    permissions.granted ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL

  if (platform === "android") {
    await Notifications.setNotificationChannelAsync("castly", {
      name: "Castly",
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }
  let permission = await Notifications.getPermissionsAsync()
  if (attempt !== generation) return "unavailable"
  if (ask && !canReceive(permission) && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync()
  }
  const previousToken = await SecureStore.getItemAsync(tokenKey)
  if (!canReceive(permission)) {
    if (previousToken && attempt === generation) {
      await writeDevice((signal) =>
        trpc.notification.unregisterDevice.mutate(
          { token: previousToken },
          { signal }
        )
      )
    }
    return permission.canAskAgain ? "enable" : "settings"
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId,
    devicePushToken,
  })
  if (attempt !== generation) return "unavailable"
  // Persist the token before the request so sign-out can revoke it even if the response is lost.
  await writeDevice(async (signal) => {
    await SecureStore.setItemAsync(tokenKey, token)
    return trpc.notification.registerDevice.mutate(
      {
        token,
        platform,
        ...(previousToken && previousToken !== token ? { previousToken } : {}),
      },
      { signal }
    )
  })
  return "registered"
}

export function watchPushDevice(onStatus: (status: PushStatus) => void) {
  if (!supported) return () => {}
  signingOut = false
  let active = true
  const refresh = (token?: DevicePushToken) => {
    void syncPushDevice(false, token)
      .then((status) => {
        if (active && !signingOut) onStatus(status)
      })
      .catch(() => {
        // Retry on reconnect or foreground. Account also offers a manual retry.
      })
  }
  const state = AppState.addEventListener("change", (next) => {
    if (next === "active") refresh()
  })
  let tokens: { remove(): void } | undefined
  void loadNotifications()
    .then((module) => {
      if (active) tokens = module.addPushTokenListener(refresh)
    })
    .catch(() => {})
  let wasOnline = false
  const unsubscribe = NetInfo.addEventListener(
    ({ isConnected, isInternetReachable }) => {
      const online = isConnected === true && isInternetReachable !== false
      if (online && !wasOnline) refresh()
      wasOnline = online
    }
  )
  return () => {
    active = false
    generation++
    syncing = undefined
    unsubscribe()
    state.remove()
    tokens?.remove()
  }
}

export async function revokePushDevice() {
  if (!supported) return
  signingOut = true
  generation++
  await pendingWrite?.catch(() => {})
  const token = await SecureStore.getItemAsync(tokenKey)
  try {
    if (token) {
      await writeDevice((signal) =>
        trpc.notification.unregisterDevice.mutate({ token }, { signal })
      )
    }
  } finally {
    const module = await loadNotifications()
    await module.dismissAllNotificationsAsync()
  }
}
