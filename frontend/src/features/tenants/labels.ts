/** Words and colours for tenant screens. The API sends *_label for codes; these cover tabs and forms. */
import type { Tenant } from '../../api/types'
import { rupeesToPaise } from '../../lib/format'

export const TENANT_TABS = [
  { value: '', label: 'All', count: 'all' },
  { value: 'active', label: 'Staying', count: 'active' },
  { value: 'notice', label: 'Leaving soon', count: 'notice' },
  { value: 'never', label: 'Not checked in', count: 'never' },
  { value: 'past', label: 'Moved out', count: 'past' },
] as const

export const TENANT_SORT = [
  { value: 'name', label: 'Name A–Z' },
  { value: '-name', label: 'Name Z–A' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
] as const

export const STAY_TONE = { active: 'good', notice: 'warn', closed: 'neutral' } as const

export const PLACE_KIND_WORDS = {
  bed: 'Beds',
  room: 'Whole rooms',
  unit: 'Whole flats and portions',
} as const

export const ID_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'passport', label: 'Passport' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'other', label: 'Other' },
] as const

export const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
] as const

export type TenantStatus = 'active' | 'notice' | 'past' | 'never'

/** Where a tenant is in their stay, in words: Staying / Leaving soon / Moved out / Not checked in. */
export function tenantStatus(t: Pick<Tenant, 'current_stay' | 'moved_out_on'>) {
  const s = t.current_stay
  if (s?.status === 'notice')
    return { key: 'notice' as const, label: 'Leaving soon', tone: 'warn' as const }
  if (s) return { key: 'active' as const, label: 'Staying', tone: 'good' as const }
  if (t.moved_out_on) return { key: 'past' as const, label: 'Moved out', tone: 'neutral' as const }
  return { key: 'never' as const, label: 'Not checked in', tone: 'info' as const }
}

/** Whole years between a birth date and today. */
export function ageFrom(dob: string | null | undefined, today = new Date()): number | null {
  if (!dob) return null
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number]
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1
  return age >= 0 ? age : null
}

export interface Deduction {
  reason: string
  amount: string
}

/** Sum of typed deductions in paise; NaN when one amount is not a number. */
export function deductionsTotal(rows: Deduction[]): number {
  let total = 0
  for (const r of rows) {
    if (!r.amount.trim()) continue
    const paise = rupeesToPaise(r.amount)
    if (paise === null) return NaN
    total += paise
  }
  return total
}
