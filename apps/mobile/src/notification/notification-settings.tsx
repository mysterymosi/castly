import { Host, Switch } from "@expo/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Linking, Platform, View } from "react-native"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { InlineError, LoadingState } from "@/components/ui/states"
import { Text } from "@/components/ui/text"
import { queryClient, trpcQuery } from "@/trpc/query-client"

import { pushDeviceOptions } from "./device-query"
import { syncPushDevice } from "./push"

const labels = {
  interest: "New interests",
  match: "New matches",
  message: "New messages",
  brief: "Role briefs",
}

export function NotificationSettings({
  userId,
  disabled,
}: {
  userId: string
  disabled: boolean
}) {
  if (Platform.OS === "web") return null
  return <NativeNotificationSettings userId={userId} disabled={disabled} />
}

function NativeNotificationSettings({
  userId,
  disabled,
}: {
  userId: string
  disabled: boolean
}) {
  const deviceOptions = pushDeviceOptions(userId)
  const device = useQuery(deviceOptions)
  const preferencesOptions = trpcQuery.notification.preferences.queryOptions()
  const preferences = useQuery(preferencesOptions)
  const enable = useMutation({
    mutationFn: () => syncPushDevice(true),
    onSuccess: (status) =>
      queryClient.setQueryData(deviceOptions.queryKey, status),
  })
  const save = useMutation(
    trpcQuery.notification.setPreference.mutationOptions({
      onSuccess: (updated) => {
        queryClient.setQueryData(preferencesOptions.queryKey, (current) =>
          current?.map((item) =>
            item.category === updated.category ? updated : item
          )
        )
      },
    })
  )

  if (device.data === "unavailable") return null

  return (
    <View className="gap-3">
      <Text variant="caption" tone="muted">
        Push notifications
      </Text>
      <Card className="gap-3">
        {device.isPending ? (
          <LoadingState label="Checking this device" />
        ) : null}
        {device.data === "enable" || device.isError ? (
          <Button
            label="Enable push on this device"
            size="md"
            variant="secondary"
            loading={enable.isPending}
            disabled={disabled}
            onPress={() => enable.mutate()}
          />
        ) : null}
        {device.data === "settings" ? (
          <>
            <Text variant="footnote" tone="muted">
              Push notifications are off in your device settings.
            </Text>
            <Button
              label="Open device settings"
              size="md"
              variant="secondary"
              disabled={disabled}
              onPress={() => void Linking.openSettings()}
            />
          </>
        ) : null}
        {enable.isError ? (
          <InlineError message="Could not enable push. Try again when you’re online." />
        ) : null}
        {preferences.data?.map((item) => (
          <Host
            matchContents={{ vertical: true }}
            key={item.category}
            style={{ minHeight: 44 }}
          >
            <Switch
              label={labels[item.category]}
              value={item.enabled}
              disabled={disabled || save.isPending}
              onValueChange={(enabled) => save.mutate({ ...item, enabled })}
            />
          </Host>
        ))}
        {preferences.data?.find(
          (item) =>
            item.category === "brief" &&
            item.enabled &&
            item.cadence === "weekly"
        ) ? (
          <Text variant="footnote" tone="muted">
            Role briefs arrive in a weekly digest.
          </Text>
        ) : null}
        {preferences.isError ? (
          <Button
            label="Retry loading preferences"
            size="md"
            variant="secondary"
            disabled={disabled}
            onPress={() => void preferences.refetch()}
          />
        ) : null}
        {save.isError ? (
          <InlineError message="Could not save your notification preferences." />
        ) : null}
      </Card>
    </View>
  )
}
