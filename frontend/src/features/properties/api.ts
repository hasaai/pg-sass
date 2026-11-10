import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import type { components } from '../../api/schema'
import type { Inventory, Property, Readiness } from '../../api/types'

export type PropertyPage = components['schemas']['PaginatedPropertyList']
export type StatusAction = 'activate' | 'deactivate' | 'archive' | 'restore'

/** Everything that shows property data, refreshed after any property change. */
export const PROPERTY_QUERIES = [
  '/properties/',
  '/floors/',
  '/units/',
  '/rooms/',
  '/beds/',
  '/reports/',
  '/listings/',
]

export interface ListParams {
  q?: string
  status?: string
  property_type?: string
  ordering?: string
  page?: number
  page_size?: number
}

export function useProperties(params: ListParams) {
  return useApi<PropertyPage>('/properties/', { page_size: 20, ...params })
}

export function useProperty(id: string) {
  return useApi<Property>(`/properties/${id}/`)
}

export function useInventory(id: string) {
  return useApi<Inventory>(`/properties/${id}/inventory/`)
}

export function useReadiness(id: string, enabled = true) {
  return useApi<Readiness>(enabled ? `/properties/${id}/readiness/` : null)
}

export function useStatusAction(onDone?: (p: Property) => void) {
  return useApiMutation(
    ({ id, action }: { id: string; action: StatusAction }) =>
      api.post<Property>(`/properties/${id}/${action}/`),
    PROPERTY_QUERIES,
    onDone,
  )
}

export function useBulkAction(onDone?: () => void) {
  return useApiMutation(
    (body: { action: StatusAction; ids: string[] }) => api.post('/properties/bulk/', body),
    PROPERTY_QUERIES,
    onDone,
  )
}

/** Which status actions make sense now, with the words on the button. */
export function statusActions(status: string): { action: StatusAction; label: string }[] {
  switch (status) {
    case 'draft':
      return [
        { action: 'activate', label: 'Open property' },
        { action: 'archive', label: 'Remove' },
      ]
    case 'active':
      return [
        { action: 'deactivate', label: 'Close for now' },
        { action: 'archive', label: 'Remove' },
      ]
    case 'inactive':
      return [
        { action: 'activate', label: 'Open again' },
        { action: 'archive', label: 'Remove' },
      ]
    case 'archived':
      return [{ action: 'restore', label: 'Restore' }]
    default:
      return []
  }
}
