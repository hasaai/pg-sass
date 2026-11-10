/**
 * The property form's rules (Zod) and the conversion to the API body. Pure, unit tested.
 * Number inputs are kept as text while typing and converted only when saving.
 */
import { z } from 'zod'

import type { Property } from '../../api/types'
import { isShortMapsLink, parseLocationInput } from '../../lib/location'
import { PROPERTY_TYPES, typeInfo } from './propertyTypes'
import type { PropertyType } from './propertyTypes'

const TYPE_VALUES = PROPERTY_TYPES.map((t) => t.value) as [PropertyType, ...PropertyType[]]

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), {
      message: `${label}: enter a whole number from ${min} to ${max}.`,
    })

export const propertySchema = z
  .object({
    property_type: z.enum(TYPE_VALUES, { message: 'Choose the kind of place.' }),
    name: z.string().trim().min(1, 'Enter a name, e.g. "Sunrise PG".').max(150),
    gender: z.enum(['men', 'women', 'coed']),
    address_line: z.string().trim().min(1, 'Enter the street address.').max(255),
    locality: z.string().trim().min(1, 'Enter the locality, e.g. HSR Layout.').max(100),
    landmark: z.string().trim().max(150),
    contact_phone: z
      .string()
      .trim()
      .refine((v) => v === '' || /^(\+?91[\s-]?)?[6-9]\d{4}\s?\d{5}$/.test(v), {
        message: 'Enter a 10-digit Indian mobile number.',
      }),
    city: z.string().trim().min(1, 'Enter the city.').max(60),
    state: z.string().trim().max(60),
    pincode: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{6}$/.test(v), { message: 'Enter a 6-digit pincode.' }),
    location: z.string().trim(),
    building_name: z.string().trim().max(150),
    total_floors: wholeNumber('Floors', 1, 200),
    year_built: wholeNumber('Year built', 1800, 2100),
    built_up_area_sqft: wholeNumber('Area', 1, 10_000_000),
    rent_due_day: wholeNumber('Rent due day', 1, 28).refine((v) => v !== '', {
      message: 'Rent due day: enter a day from 1 to 28.',
    }),
    description: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.location && !parseLocationInput(v.location)) {
      ctx.addIssue({
        code: 'custom',
        path: ['location'],
        message: isShortMapsLink(v.location)
          ? 'Short "maps.app.goo.gl" links hide the location. Open the link, then copy the full link from the address bar, or search on the map.'
          : 'Paste a Google Maps link or numbers like "12.9116, 77.6474".',
      })
    }
  })

export type PropertyFormValues = z.infer<typeof propertySchema>

/** Which fields each step owns (validated and saved by that step). */
export const STEP_FIELDS = {
  type: ['property_type'],
  details: [
    'name',
    'gender',
    'address_line',
    'locality',
    'landmark',
    'contact_phone',
    'city',
    'state',
    'pincode',
    'location',
  ],
  building: [
    'building_name',
    'total_floors',
    'year_built',
    'built_up_area_sqft',
    'rent_due_day',
    'description',
  ],
} as const satisfies Record<string, readonly (keyof PropertyFormValues)[]>

/** API field → form field, for mapping server errors back onto the form. */
export const API_FIELD: Record<string, keyof PropertyFormValues> = {
  latitude: 'location',
  longitude: 'location',
}

export function initialValues(p?: Property | null): PropertyFormValues {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  return {
    property_type: (p?.property_type as PropertyType | undefined) ?? 'pg',
    name: p?.name ?? '',
    gender: (p?.gender as 'men' | 'women' | 'coed' | undefined) ?? 'coed',
    address_line: p?.address_line ?? '',
    locality: p?.locality ?? '',
    landmark: p?.landmark ?? '',
    contact_phone: p?.contact_phone ?? '',
    city: p?.city ?? 'Bengaluru',
    state: p?.state ?? 'Karnataka',
    pincode: p?.pincode ?? '',
    location: p?.latitude && p?.longitude ? `${p.latitude}, ${p.longitude}` : '',
    building_name: p?.building_name ?? '',
    total_floors: s(p?.total_floors),
    year_built: s(p?.year_built),
    built_up_area_sqft: s(p?.built_up_area_sqft),
    rent_due_day: s(p?.rent_due_day ?? 5),
    description: p?.description ?? '',
  }
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))

/**
 * The PATCH/POST body for the given fields. Questions that do not apply to the type
 * are sent empty, so switching a building to a PG does not leave a stale building name.
 */
export function toBody(
  v: PropertyFormValues,
  fields: readonly (keyof PropertyFormValues)[],
): Record<string, unknown> {
  const t = typeInfo(v.property_type)
  const full: Record<string, unknown> = {
    property_type: v.property_type,
    name: v.name.trim(),
    gender: t.sharedLiving ? v.gender : 'coed',
    address_line: v.address_line.trim(),
    locality: v.locality.trim(),
    landmark: v.landmark.trim(),
    contact_phone: v.contact_phone.trim(),
    city: v.city.trim(),
    state: v.state.trim(),
    pincode: v.pincode.trim(),
    building_name: t.asks.buildingName ? v.building_name.trim() : '',
    total_floors: t.asks.totalFloors ? num(v.total_floors) : null,
    year_built: t.asks.yearBuilt ? num(v.year_built) : null,
    built_up_area_sqft: t.asks.area ? num(v.built_up_area_sqft) : null,
    rent_due_day: num(v.rent_due_day) ?? 5,
    description: v.description.trim(),
  }
  const point = v.location ? parseLocationInput(v.location) : null
  const body: Record<string, unknown> = {}
  for (const f of fields) {
    if (f === 'location') {
      body.latitude = point?.latitude ?? null
      body.longitude = point?.longitude ?? null
    } else body[f] = full[f]
  }
  return body
}

/** Every field, for the first save of a new property. */
export const ALL_FIELDS = [
  ...STEP_FIELDS.type,
  ...STEP_FIELDS.details,
  ...STEP_FIELDS.building,
] as (keyof PropertyFormValues)[]
