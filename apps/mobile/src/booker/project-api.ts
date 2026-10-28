import {
  projectDetailSchema,
  projectListSchema,
  roleFormOptionsSchema,
  type ProjectDetail,
} from "@workspace/schema"

import { invoke, trpc } from "@/trpc/client"

function asDetail(data: unknown): ProjectDetail {
  return projectDetailSchema.parse(data)
}

export const projectApi = {
  list(includeArchived = false) {
    return invoke(async () =>
      projectListSchema.parse(await trpc.project.list.query({ includeArchived })),
    )
  },
  get(projectId: string) {
    return invoke(async () => asDetail(await trpc.project.get.query({ projectId })))
  },
  create(input: Parameters<typeof trpc.project.create.mutate>[0]) {
    return invoke(async () => asDetail(await trpc.project.create.mutate(input)))
  },
  archive(projectId: string) {
    return invoke(async () => asDetail(await trpc.project.archive.mutate({ projectId })))
  },
  roleFormOptions() {
    return invoke(async () => roleFormOptionsSchema.parse(await trpc.role.formOptions.query()))
  },
  createRole(input: Parameters<typeof trpc.role.create.mutate>[0]) {
    return invoke(async () => asDetail(await trpc.role.create.mutate(input)))
  },
  updateRole(input: Parameters<typeof trpc.role.update.mutate>[0]) {
    return invoke(async () => asDetail(await trpc.role.update.mutate(input)))
  },
}
