import type { components } from '../../api/schema'

type S = components['schemas']
export type Overview = S['Overview']
export type Activity = S['Activity']
export type PlatformOrganization = S['PlatformOrganization']
export type PlatformProperty = S['PlatformProperty']
export type PlatformPropertyDetail = S['PlatformPropertyDetail']
export type PlatformUser = S['PlatformUser']
export type PlatformAmenity = S['PlatformAmenity']
export type OrgPage = S['PaginatedPlatformOrganizationList']
export type PropertyPage = S['PaginatedPlatformPropertyList']
export type UserPage = S['PaginatedPlatformUserList']

/** Everything the platform screens show, refreshed after any platform action. */
export const PLATFORM_QUERIES = ['/platform/']

/** "property.document_downloaded" → "Property document downloaded". */
export function actionWords(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
