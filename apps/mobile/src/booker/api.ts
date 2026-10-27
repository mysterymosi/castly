import { bookerProfileStateSchema, type BookerProfileState } from "@workspace/schema"

import { invoke, trpc } from "@/trpc/client"

function asProfileState(data: unknown): BookerProfileState {
  return bookerProfileStateSchema.parse(data)
}

export const bookerApi = {
  getProfile() {
    return invoke(async () => asProfileState(await trpc.booker.getProfile.query()))
  },
  updateProfile(input: Parameters<typeof trpc.booker.updateProfile.mutate>[0]) {
    return invoke(async () => asProfileState(await trpc.booker.updateProfile.mutate(input)))
  },
  submitVerification() {
    return invoke(async () => asProfileState(await trpc.booker.submitVerification.mutate()))
  },
}
