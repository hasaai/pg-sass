/**
 * Amenity selection state for the property form (pure functions, unit tested).
 *
 * The catalog (categories, amenities, which details each supports) comes from the API;
 * nothing here hard-codes amenities. A "draft" is what the owner is editing; it is
 * turned into the API payload by `toPayload`, which drops any field the amenity does
 * not support so stale values never reach the server.
 */
import type {
  AmenityAssignmentRequest,
  AmenityCatalog,
  CatalogAmenity,
  CatalogCategory,
  PropertyAmenity,
  PublicAmenity,
} from '../api/types'
import { formatMoney, paiseToRupeesInput, rupeesToPaise } from './format'

export type DetailValue = string | number | boolean | string[]

export interface AmenityDraft {
  amenity: string
  status: 'available' | 'unavailable'
  sharing: '' | 'shared' | 'private'
  charge: '' | 'included' | 'extra'
  /** Rupees as typed (converted to paise on save). */
  charge_amount: string
  charge_period: '' | 'month' | 'one_time' | 'per_use'
  quantity: string
  level: 'property' | 'room'
  rooms: string[]
  details: Record<string, DetailValue>
  note: string
}

/** Selected amenities by key, in the order they were picked. */
export type Drafts = Record<string, AmenityDraft>

/** Field errors per amenity key, as returned by the API (or found before sending). */
export type DraftErrors = Record<string, Record<string, string>>

export function newDraft(amenity: string): AmenityDraft {
  return {
    amenity,
    status: 'available',
    sharing: '',
    charge: '',
    charge_amount: '',
    charge_period: '',
    quantity: '',
    level: 'property',
    rooms: [],
    details: {},
    note: '',
  }
}

export function fromSaved(rows: PropertyAmenity[]): Drafts {
  const drafts: Drafts = {}
  for (const r of rows) {
    drafts[r.amenity] = {
      amenity: r.amenity,
      status: r.status,
      sharing: (r.sharing as AmenityDraft['sharing']) ?? '',
      charge: (r.charge as AmenityDraft['charge']) ?? '',
      charge_amount: r.charge_amount ? paiseToRupeesInput(r.charge_amount) : '',
      charge_period: (r.charge_period as AmenityDraft['charge_period']) ?? '',
      quantity: r.quantity ? String(r.quantity) : '',
      level: r.level,
      rooms: [...r.rooms],
      details: { ...(r.details as Record<string, DetailValue>) },
      note: r.note ?? '',
    }
  }
  return drafts
}

export function amenityIndex(catalog: AmenityCatalog | undefined): Map<string, CatalogAmenity> {
  const index = new Map<string, CatalogAmenity>()
  for (const c of catalog?.categories ?? []) for (const a of c.amenities) index.set(a.key, a)
  return index
}

export function appliesTo(amenity: CatalogAmenity, propertyType: string): boolean {
  return amenity.property_types.length === 0 || amenity.property_types.includes(propertyType)
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Categories with only the amenities for this property type that match the search. */
export function visibleCategories(
  catalog: AmenityCatalog | undefined,
  propertyType: string,
  query: string,
): CatalogCategory[] {
  const q = normalise(query)
  return (catalog?.categories ?? [])
    .map((c) => ({
      ...c,
      amenities: c.amenities.filter(
        (a) =>
          appliesTo(a, propertyType) &&
          (!q ||
            normalise(a.name).includes(q) ||
            a.aliases.some((alias) => normalise(alias).includes(q)) ||
            normalise(c.name).includes(q)),
      ),
    }))
    .filter((c) => c.amenities.length > 0)
}

/** Selected amenities that the new property type no longer allows. */
export function incompatible(
  drafts: Drafts,
  index: Map<string, CatalogAmenity>,
  propertyType: string,
): string[] {
  return Object.keys(drafts).filter((key) => {
    const a = index.get(key)
    return !a || !appliesTo(a, propertyType)
  })
}

/** Turn drafts into the PUT payload; returns errors for values that are not numbers. */
export function toPayload(
  drafts: Drafts,
  index: Map<string, CatalogAmenity>,
): { assignments: AmenityAssignmentRequest[]; errors: DraftErrors; order: string[] } {
  const assignments: AmenityAssignmentRequest[] = []
  const errors: DraftErrors = {}
  const order: string[] = []
  for (const d of Object.values(drafts)) {
    const a = index.get(d.amenity)
    if (!a) continue
    order.push(d.amenity)
    const item: AmenityAssignmentRequest = {
      amenity: d.amenity,
      status: d.status,
      level: 'property',
      note: d.note.trim(),
    }
    if (d.status === 'available') {
      const fail = (field: string, message: string) => {
        errors[d.amenity] = { ...errors[d.amenity], [field]: message }
      }
      if (a.supports_sharing && d.sharing) item.sharing = d.sharing
      if (a.supports_charge && d.charge) {
        item.charge = d.charge
        if (d.charge === 'extra') {
          const paise = rupeesToPaise(d.charge_amount)
          if (paise === null || paise <= 0)
            fail('charge_amount', 'Enter the charge in rupees, e.g. 500.')
          else item.charge_amount = paise
          if (d.charge_period) item.charge_period = d.charge_period
        }
      }
      if (a.supports_quantity && d.quantity.trim()) {
        const n = Number(d.quantity)
        if (!Number.isInteger(n) || n < 1) fail('quantity', 'Enter a whole number.')
        else item.quantity = n
      }
      if (a.supports_rooms && d.level === 'room') {
        item.level = 'room'
        item.rooms = d.rooms
      }
      const details: Record<string, DetailValue> = {}
      for (const attr of a.attributes) {
        const value = d.details[attr.key]
        if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))
          continue
        if (attr.type === 'int') {
          const n = Number(value)
          if (!Number.isInteger(n)) {
            fail('details', `${attr.label}: enter a whole number.`)
            continue
          }
          details[attr.key] = n
        } else details[attr.key] = value
      }
      if (Object.keys(details).length) item.details = details
    }
    assignments.push(item)
  }
  return { assignments, errors, order }
}

/** Map the API's per-item errors (array in payload order) back to amenity keys. */
export function errorsFromApi(fields: Record<string, unknown>, order: string[]): DraftErrors {
  const list = fields.assignments
  const out: DraftErrors = {}
  if (!Array.isArray(list)) return out
  list.forEach((entry, i) => {
    const key = order[i]
    if (!key || !entry || typeof entry !== 'object' || Array.isArray(entry)) return
    const flat: Record<string, string> = {}
    for (const [field, value] of Object.entries(entry as Record<string, unknown>)) {
      flat[field] = flattenMessage(value)
    }
    if (Object.keys(flat).length) out[key] = flat
  })
  return out
}

function flattenMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(flattenMessage).join(' ')
  if (value && typeof value === 'object')
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${flattenMessage(v)}`)
      .join(' ')
  return String(value)
}

/** One-line summary of how an amenity is offered, e.g. "Shared · ₹500 per month". */
export function offerLabel(d: AmenityDraft): string {
  if (d.status === 'unavailable') return 'Not available'
  const parts: string[] = []
  if (d.sharing) parts.push(d.sharing === 'shared' ? 'Shared' : 'Private')
  if (d.charge === 'included') parts.push('Included in rent')
  if (d.charge === 'extra') {
    const paise = rupeesToPaise(d.charge_amount)
    const period = { month: 'per month', one_time: 'one time', per_use: 'per use', '': '' }[
      d.charge_period
    ]
    parts.push(paise ? `${formatMoney(paise)} ${period}`.trim() : 'Extra charge')
  }
  if (d.level === 'room') parts.push(`In ${d.rooms.length} room${d.rooms.length === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

export function samePayload(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/* ---------- display (property page and public listing) ---------- */

export interface AmenityView {
  key: string
  name: string
  category: string
  category_name: string
  sharing: string
  charge: string
  charge_label: string
  detail_labels: string[]
  where?: string
  unavailable?: boolean
  note?: string
}

export function fromPublic(rows: PublicAmenity[]): AmenityView[] {
  return rows.map((r) => ({ ...r, where: r.in_some_rooms ? 'In some rooms' : undefined }))
}

export function fromOperator(rows: PropertyAmenity[]): AmenityView[] {
  return rows.map((r) => ({
    key: r.amenity,
    name: r.name,
    category: r.category,
    category_name: r.category_name,
    sharing: r.sharing,
    charge: r.charge,
    charge_label: r.charge_label,
    detail_labels: r.detail_labels,
    where: r.level === 'room' ? `Rooms ${r.room_numbers.join(', ')}` : undefined,
    unavailable: r.status === 'unavailable',
    note: r.note,
  }))
}
