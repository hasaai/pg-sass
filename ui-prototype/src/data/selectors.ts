/** Small read helpers and the words shown on screen for each code. */
import { TODAY } from './seed'
import type { Db } from './store'
import type { Bed, Invoice, Property, Room, Tenant } from './types'

export const BED_STATUS = {
  vacant: { label: 'Vacant', tone: 'good' },
  occupied: { label: 'Filled', tone: 'info' },
  reserved: { label: 'Reserved', tone: 'warn' },
  blocked: { label: 'Not available', tone: 'neutral' },
  notice: { label: 'On notice', tone: 'warn' },
} as const

export const TENANT_STATUS = {
  active: { label: 'Staying', tone: 'good' },
  notice: { label: 'On notice', tone: 'warn' },
  upcoming: { label: 'Moving in soon', tone: 'info' },
  moved_out: { label: 'Moved out', tone: 'neutral' },
} as const

export const INVOICE_STATUS = {
  paid: { label: 'Paid', tone: 'good' },
  partly_paid: { label: 'Partly paid', tone: 'warn' },
  due: { label: 'Due', tone: 'info' },
  overdue: { label: 'Overdue', tone: 'bad' },
} as const

export const COMPLAINT_STATUS = {
  open: { label: 'New', tone: 'bad' },
  in_progress: { label: 'Being fixed', tone: 'warn' },
  resolved: { label: 'Fixed', tone: 'good' },
  closed: { label: 'Closed', tone: 'neutral' },
} as const

export const PRIORITY = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'warn' },
  urgent: { label: 'Urgent', tone: 'bad' },
} as const

export const COMPLAINT_CATEGORY = {
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  cleaning: 'Cleaning',
  wifi: 'Wi-Fi',
  food: 'Food',
  furniture: 'Furniture',
  appliance: 'Appliance',
  security: 'Security',
  other: 'Other',
} as const

export const PROPERTY_STATUS = {
  draft: { label: 'Not finished', tone: 'neutral' },
  active: { label: 'Open', tone: 'good' },
  inactive: { label: 'Closed for now', tone: 'warn' },
  archived: { label: 'Archived', tone: 'neutral' },
} as const

export const VERIFICATION = {
  unverified: { label: 'Not checked yet', tone: 'neutral' },
  submitted: { label: 'Sent for checking', tone: 'info' },
  under_review: { label: 'Being checked', tone: 'info' },
  verified: { label: 'Verified', tone: 'good' },
  changes_requested: { label: 'Changes needed', tone: 'warn' },
  rejected: { label: 'Not approved', tone: 'bad' },
} as const

export const OWNER_CHECK = {
  not_started: { label: 'Not started', tone: 'neutral' },
  draft: { label: 'Not sent yet', tone: 'neutral' },
  submitted: { label: 'Sent for checking', tone: 'info' },
  under_review: { label: 'Being checked', tone: 'info' },
  more_info: { label: 'More information needed', tone: 'warn' },
  approved: { label: 'Verified', tone: 'good' },
  rejected: { label: 'Not approved', tone: 'bad' },
} as const

export const PAY_MODE = { upi: 'UPI', cash: 'Cash', bank: 'Bank transfer', card: 'Card' } as const

export const PROPERTY_TYPE = {
  pg: 'PG (paying guest)',
  hostel: 'Hostel',
  coliving: 'Co-living',
  apartment: 'Apartment / flats',
} as const

export const GENDER = { men: 'Men only', women: 'Women only', coed: 'Anyone' } as const

export const EXPENSE_CATEGORY = {
  electricity: 'Electricity',
  water: 'Water',
  internet: 'Internet',
  groceries: 'Groceries & food',
  gas: 'Cooking gas',
  maintenance: 'Repairs',
  salary: 'Salaries',
  rent: 'Building rent',
  cleaning: 'Cleaning',
  other: 'Other',
} as const

export const STAFF_ROLE = {
  cook: 'Cook',
  cleaner: 'Cleaner',
  security: 'Security guard',
  caretaker: 'Caretaker / warden',
  electrician: 'Electrician',
  helper: 'Helper',
} as const

export function floorName(n: number) {
  if (n === 0) return 'Ground floor'
  const suffix =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th'
  return `${n}${suffix} floor`
}

export function propertyName(db: Db, id: string | undefined) {
  return db.properties.find((p) => p.id === id)?.name ?? '—'
}

export function bedOf(db: Db, t: Tenant | undefined): Bed | undefined {
  return t?.bedId ? db.beds.find((b) => b.id === t.bedId) : undefined
}

export function roomOfBed(db: Db, bed: Bed | undefined): Room | undefined {
  return bed ? db.rooms.find((r) => r.id === bed.roomId) : undefined
}

/** "Room 203 · Bed B" */
export function placeLabel(db: Db, t: Tenant | undefined): string {
  const bed = bedOf(db, t)
  const room = roomOfBed(db, bed)
  if (!bed || !room) return t?.status === 'moved_out' ? 'Moved out' : 'No bed yet'
  return room.sharing === 1 ? `Room ${room.number}` : `Room ${room.number} · Bed ${bed.label}`
}

export function occupancy(db: Db, propertyId?: string) {
  const list = db.beds.filter((b) => !propertyId || b.propertyId === propertyId)
  const filled = list.filter((b) => b.status === 'occupied' || b.status === 'notice').length
  return {
    beds: list.length,
    filled,
    vacant: list.filter((b) => b.status === 'vacant').length,
    reserved: list.filter((b) => b.status === 'reserved').length,
    pct: list.length ? Math.round((filled / list.length) * 100) : 0,
  }
}

export function balance(i: Invoice) {
  return i.total - i.paid
}

export function daysLate(i: Invoice) {
  if (i.status === 'paid' || i.dueOn >= TODAY) return 0
  const ms = new Date(TODAY).getTime() - new Date(i.dueOn).getTime()
  return Math.round(ms / 86400000)
}

export function propertyOptions(properties: Property[]) {
  return properties
    .filter((p) => p.status !== 'archived')
    .map((p) => ({ value: p.id, label: p.name }))
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}
