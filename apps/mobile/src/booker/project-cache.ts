import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "api/router"

import { queryClient, trpcQuery } from "@/trpc/query-client"

type ProjectDetailData = inferRouterOutputs<AppRouter>["project"]["get"]

/**
 * After a project or role mutation: the response is the project's new detail, so it goes straight
 * into the `project.get` cache, and every `project.list` (role counts, archived projects) refetches.
 */
export function cacheProjectDetail(project: ProjectDetailData) {
  queryClient.setQueryData(trpcQuery.project.get.queryKey({ projectId: project.id }), project)
  void queryClient.invalidateQueries(trpcQuery.project.list.pathFilter())
}
