import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "api/router"

import { queryClient, trpcQuery } from "@/trpc/query-client"

type ShortlistDetailData = inferRouterOutputs<AppRouter>["shortlist"]["get"]

/**
 * After a shortlist edit: the response is the list's new detail, so it goes straight into the
 * `shortlist.get` cache, and `shortlist.list` (entry counts, recency order) refetches.
 */
export function cacheShortlistDetail(detail: ShortlistDetailData) {
  queryClient.setQueryData(trpcQuery.shortlist.get.queryKey({ shortlistId: detail.shortlist.id }), detail)
  void queryClient.invalidateQueries(trpcQuery.shortlist.list.pathFilter())
}
