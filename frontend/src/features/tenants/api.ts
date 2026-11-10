import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import type { components } from '../../api/schema'
import type { Stay, Tenant } from '../../api/types'

type S = components['schemas']
export type TenantPage = S['PaginatedTenantList']
export type TenantCounts = S['TenantSummaryCounts']
export type FreePlace = S['FreePlace']
export type PlaceKind = S['PlaceKindEnum']
export type StayPlace = S['StayPlace']

/** Everything that shows tenant or occupancy data, refreshed after any tenant change. */
export const TENANT_QUERIES = [
  '/tenants/',
  '/stays/',
  '/beds/',
  '/rooms/',
  '/units/',
  '/properties/',
  '/invoices/',
  '/reports/',
  '/listings/',
]

export interface TenantListParams {
  q?: string
  status?: string
  property?: string
  ordering?: string
  page?: number
  page_size?: number
}

export function useTenants(params: TenantListParams) {
  return useApi<TenantPage>('/tenants/', { page_size: 20, ...params })
}

export function useTenantCounts(params: Pick<TenantListParams, 'q' | 'property'>) {
  return useApi<TenantCounts>('/tenants/summary/', params)
}

export function useFreePlaces(propertyId: string | null) {
  return useApi<FreePlace[]>(propertyId ? '/stays/free-places/' : null, {
    property: propertyId ?? undefined,
  })
}

/** The body field for a chosen place: { bed }, { room } or { unit }. */
export function placeBody(kind: PlaceKind, id: string): Record<string, string> {
  return { [kind]: id }
}

export function useStayAction<TBody>(stay: Pick<Stay, 'id'>, action: string, onDone?: () => void) {
  return useApiMutation(
    (body: TBody) => api.post<Stay>(`/stays/${stay.id}/${action}/`, body),
    TENANT_QUERIES,
    onDone,
  )
}

export function openStay(stays: Stay[]): Stay | undefined {
  return stays.find((s) => s.status !== 'closed')
}

export function displayPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone
}

export function whatsappLink(phone: string, text?: string): string {
  const q = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/91${phone}${q}`
}

export type { Stay, Tenant }
