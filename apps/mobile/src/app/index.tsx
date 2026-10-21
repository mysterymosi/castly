import { Redirect } from "expo-router"

import { useSession } from "@/auth/session-provider"

export default function Index() {
  const { status } = useSession()
  return <Redirect href={status === "signedIn" ? "/studio" : "/welcome"} />
}
