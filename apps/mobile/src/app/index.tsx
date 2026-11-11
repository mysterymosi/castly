import { Redirect } from "expo-router"

import { useSession } from "@/auth/session-provider"
import { modeHome, useActiveMode } from "@/mode/active-mode"

export default function Index() {
  const { status } = useSession()
  const mode = useActiveMode()
  return <Redirect href={status === "signedIn" ? modeHome[mode] : "/welcome"} />
}
