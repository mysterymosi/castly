import { router } from "expo-router"
import { useState } from "react"

import { authApi } from "@/auth/client"
import { errorMessage, useSession } from "@/auth/session-provider"
import { Button } from "@/components/ui/button"
import { Screen } from "@/components/ui/screen"
import { EmptyState, InlineError } from "@/components/ui/states"
import { queryClient, trpcQuery } from "@/trpc/query-client"

/** Shown on booker tabs to a user without booker mode: turns it on, then opens booker setup. */
export function EnableBooker({ body }: { body: string }) {
  const { refreshMe } = useSession()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enable() {
    setPending(true)
    setError(null)
    try {
      await authApi.enableMode("booker")
      await refreshMe()
      await queryClient.invalidateQueries(trpcQuery.booker.pathFilter())
      router.push("/booker-setup")
    } catch (caught) {
      setError(errorMessage(caught, "Could not enable booker mode"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen edges={["top"]} contentClassName="justify-center">
      <EmptyState icon="briefcase" title="Turn on booker mode" body={body} />
      <Button label="Enable booker mode" loading={pending} onPress={enable} className="mx-6" />
      {error ? <InlineError message={error} className="mx-6 mt-4" /> : null}
    </Screen>
  )
}

/** Shown on booker tabs until booker setup (PRD §6.2 vertical profiling) is finished. */
export function FinishBookerProfile({ body }: { body: string }) {
  return (
    <Screen edges={["top"]} contentClassName="justify-center">
      <EmptyState
        icon="briefcase"
        title="Finish your booker profile"
        body={body}
        actionLabel="Set up booker profile"
        onAction={() => router.push("/booker-setup")}
      />
    </Screen>
  )
}
