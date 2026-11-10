import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseQueryOptions } from '@tanstack/react-query'

import { api } from './client'
import type { ApiError } from './client'
import type { Page } from './types'

type Query = Record<string, string | number | boolean | null | undefined>

/** GET a resource. The query key is [path, params] so invalidating a path refreshes it. */
export function useApi<T>(
  path: string | null,
  params?: Query,
  options?: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T, ApiError>({
    queryKey: [path, params ?? {}],
    queryFn: () => api.get<T>(path as string, params),
    enabled: path !== null && (options?.enabled ?? true),
    ...options,
  })
}

/** GET a list (first 100 rows; lists in this app stay well under that per screen). */
export function useList<T>(path: string | null, params?: Query) {
  const query = useApi<Page<T>>(path, { page_size: 100, ...params })
  return { ...query, rows: query.data?.results ?? [], hasMore: Boolean(query.data?.next) }
}

/**
 * Mutation that refreshes every query whose path starts with one of `invalidate`
 * (e.g. ['/beds/', '/rooms/']) once it succeeds.
 */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  invalidate: string[] = [],
  onSuccess?: (result: TResult, vars: TVars) => void,
) {
  const queryClient = useQueryClient()
  return useMutation<TResult, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0]
          return typeof key === 'string' && invalidate.some((prefix) => key.startsWith(prefix))
        },
      })
      onSuccess?.(result, vars)
    },
  })
}
