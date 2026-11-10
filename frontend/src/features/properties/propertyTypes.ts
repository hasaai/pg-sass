/**
 * What changes on screen with the kind of place. One table, so every screen agrees:
 * which questions the form asks, what a "unit" is called, which tabs the property page shows.
 * Words here are shown to owners as they are (see the glossary in the architecture doc).
 */
import type { components } from '../../api/schema'

export type PropertyType = components['schemas']['PropertyTypeEnum']

/** How the place is laid out for renting. */
export type Structure =
  | 'rooms' // rooms and beds directly under the property (PG, hostel)
  | 'rooms_or_flats' // rooms, optionally grouped in flats (co-living)
  | 'flats' // flats rented whole or room by room (apartment, building)
  | 'portions' // a house rented whole or by portion

export interface PropertyTypeInfo {
  value: PropertyType
  label: string
  description: string
  /** Shared living: tenants rent beds or rooms and the owner says who it is for. */
  sharedLiving: boolean
  structure: Structure
  /** What one flat/portion is called; null when the type has none. */
  unitWord: 'Flat' | 'Portion' | null
  unitWordPlural: 'Flats' | 'Portions' | null
  /** Building questions asked in the form. */
  asks: {
    buildingName: boolean
    yearBuilt: boolean
    area: boolean
    totalFloors: boolean
  }
  /** Room defaults when adding a room. */
  roomDefaults: { sharing: number; roomType: 'private' | 'shared' | 'dormitory' }
}

export const PROPERTY_TYPES: PropertyTypeInfo[] = [
  {
    value: 'pg',
    label: 'PG (paying guest)',
    description: 'Beds in single or shared rooms, often with meals.',
    sharedLiving: true,
    structure: 'rooms',
    unitWord: null,
    unitWordPlural: null,
    asks: { buildingName: false, yearBuilt: false, area: false, totalFloors: true },
    roomDefaults: { sharing: 2, roomType: 'shared' },
  },
  {
    value: 'coliving',
    label: 'Co-living',
    description: 'Private and shared rooms, sometimes inside flats, with common areas.',
    sharedLiving: true,
    structure: 'rooms_or_flats',
    unitWord: 'Flat',
    unitWordPlural: 'Flats',
    asks: { buildingName: true, yearBuilt: false, area: false, totalFloors: true },
    roomDefaults: { sharing: 1, roomType: 'private' },
  },
  {
    value: 'hostel',
    label: 'Hostel',
    description: 'Dormitories and shared rooms rented bed by bed.',
    sharedLiving: true,
    structure: 'rooms',
    unitWord: null,
    unitWordPlural: null,
    asks: { buildingName: false, yearBuilt: false, area: false, totalFloors: true },
    roomDefaults: { sharing: 4, roomType: 'dormitory' },
  },
  {
    value: 'apartment',
    label: 'Apartment',
    description: 'One or a few flats in a society, rented to families or groups.',
    sharedLiving: false,
    structure: 'flats',
    unitWord: 'Flat',
    unitWordPlural: 'Flats',
    asks: { buildingName: true, yearBuilt: true, area: true, totalFloors: true },
    roomDefaults: { sharing: 1, roomType: 'private' },
  },
  {
    value: 'building',
    label: 'Standalone building',
    description: 'A whole building of flats that you own or manage.',
    sharedLiving: false,
    structure: 'flats',
    unitWord: 'Flat',
    unitWordPlural: 'Flats',
    asks: { buildingName: true, yearBuilt: true, area: true, totalFloors: true },
    roomDefaults: { sharing: 1, roomType: 'private' },
  },
  {
    value: 'house',
    label: 'Independent house / villa',
    description: 'Rented as a whole house, or by portion (ground floor, first floor).',
    sharedLiving: false,
    structure: 'portions',
    unitWord: 'Portion',
    unitWordPlural: 'Portions',
    asks: { buildingName: false, yearBuilt: true, area: true, totalFloors: true },
    roomDefaults: { sharing: 1, roomType: 'private' },
  },
]

const BY_VALUE = new Map(PROPERTY_TYPES.map((t) => [t.value, t]))

export function typeInfo(value: string | undefined): PropertyTypeInfo {
  return BY_VALUE.get(value as PropertyType) ?? PROPERTY_TYPES[0]!
}

/** Which tabs the property page shows for this type. */
export function detailTabs(value: string | undefined): {
  units: boolean
  rooms: boolean
} {
  const t = typeInfo(value)
  return {
    units: t.unitWord !== null,
    rooms: true,
  }
}

/** "Rooms & beds" for shared living, "Rooms" for the others. */
export function roomsTabLabel(value: string | undefined): string {
  return typeInfo(value).sharedLiving ? 'Rooms & beds' : 'Rooms'
}
