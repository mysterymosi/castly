import { useCallback, useState } from "react"

/**
 * Props for a list's pull-to-refresh that follow the user's pull, not the query. A list that polls
 * or refetches on focus would otherwise flip `refreshing` on by itself, and iOS then draws the
 * spinner stuck and unanimated until the user pulls, because nothing pulled it into view.
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(() => {
    setRefreshing(true)
    refetch()
      .catch(() => {})
      .finally(() => setRefreshing(false))
  }, [refetch])
  return { refreshing, onRefresh }
}
