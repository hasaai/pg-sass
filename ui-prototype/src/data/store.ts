/**
 * The prototype's "database": the sample data in memory. Screens read it with `useDb` and
 * change it with `updateDb`, so actions (add a room, record a payment) show up everywhere
 * straight away. A page reload starts again from the sample data.
 */
import { useSyncExternalStore } from 'react'

import * as seed from './seed'
import type {
  Activity,
  Bed,
  Business,
  Complaint,
  Enquiry,
  Expense,
  Invoice,
  Member,
  Notice,
  Payment,
  PlatformBusiness,
  PlatformPayment,
  PlatformStaffMember,
  Property,
  Reminder,
  Room,
  SmsGateway,
  Staff,
  SupportTicket,
  Tenant,
  VerificationItem,
} from './types'

export interface Db {
  business: Business
  properties: Property[]
  rooms: Room[]
  beds: Bed[]
  tenants: Tenant[]
  invoices: Invoice[]
  payments: Payment[]
  complaints: Complaint[]
  notices: Notice[]
  expenses: Expense[]
  staff: Staff[]
  members: Member[]
  activity: Activity[]
  reminders: Reminder[]
  enquiries: Enquiry[]
  platformBusinesses: PlatformBusiness[]
  verificationQueue: VerificationItem[]
  platformPayments: PlatformPayment[]
  smsGateways: SmsGateway[]
  platformStaff: PlatformStaffMember[]
  supportTickets: SupportTicket[]
  settings: {
    lateFeePerDay: number
    lateFeeAfterDays: number
    reminderBeforeDays: number
    reminderChannels: ('whatsapp' | 'sms' | 'email')[]
    autoReminders: boolean
    upiId: string
    receiptFooter: string
    billOnDay: number
  }
}

function initial(): Db {
  return structuredClone({
    business: seed.business,
    properties: seed.properties,
    rooms: seed.rooms,
    beds: seed.beds,
    tenants: seed.tenants,
    invoices: seed.invoices,
    payments: seed.payments,
    complaints: seed.complaints,
    notices: seed.notices,
    expenses: seed.expenses,
    staff: seed.staff,
    members: seed.members,
    activity: seed.activity,
    reminders: seed.reminders,
    enquiries: seed.enquiries,
    platformBusinesses: seed.platformBusinesses,
    verificationQueue: seed.verificationQueue,
    platformPayments: seed.platformPayments,
    smsGateways: seed.smsGateways,
    platformStaff: seed.platformStaff,
    supportTickets: seed.supportTickets,
    settings: {
      lateFeePerDay: 10000,
      lateFeeAfterDays: 2,
      reminderBeforeDays: 3,
      reminderChannels: ['whatsapp', 'sms'],
      autoReminders: true,
      upiId: 'ashastays@okhdfc',
      receiptFooter: 'Thank you for staying with Asha Stays.',
      billOnDay: 1,
    },
  })
}

let state: Db = initial()
const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Read from the store. Return stable values (arrays/objects from the store, or primitives). */
export function useDb<T>(select: (db: Db) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

/** Change the store. The function gets a copy it may change freely. */
export function updateDb(change: (draft: Db) => void) {
  const draft = { ...state }
  // Copy each top-level list/object so readers see new references.
  for (const key of Object.keys(draft) as (keyof Db)[]) {
    const value = draft[key]
    ;(draft as Record<string, unknown>)[key] = Array.isArray(value)
      ? value.map((v) => (typeof v === 'object' && v !== null ? { ...v } : v))
      : typeof value === 'object' && value !== null
        ? { ...value }
        : value
  }
  change(draft)
  state = draft
  listeners.forEach((fn) => fn())
}

export function getDb(): Db {
  return state
}

export function resetDb() {
  state = initial()
  listeners.forEach((fn) => fn())
}

let counter = 1000
export function newId(prefix: string) {
  counter += 1
  return `${prefix}${counter}`
}

/** Add a line to the activity log (shown on the dashboard and Activity page). */
export function logActivity(draft: Db, a: Omit<Activity, 'id' | 'at' | 'by'> & { by?: string }) {
  draft.activity.unshift({
    id: newId('a'),
    at: new Date().toISOString().slice(0, 19),
    by: a.by ?? 'Asha Rao',
    action: a.action,
    target: a.target,
    propertyId: a.propertyId,
    kind: a.kind,
  })
}
