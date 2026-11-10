/** Helpers and small in-memory state for the core business screens (no backend). */
import { useSyncExternalStore } from 'react'

import { ROLE_PERMS, TODAY } from '../../data/seed'
import { getDb } from '../../data/store'
import type { Activity, Invoice } from '../../data/types'
import { parseDate, relativeTime } from '../../lib/format'

/** Whole days from TODAY to `iso` (negative = in the past). */
export function daysFromToday(iso: string) {
  return Math.round((parseDate(iso).getTime() - parseDate(TODAY).getTime()) / 86400000)
}

export function addDaysISO(iso: string, n: number) {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "₹1.2L", "₹48.5K" for chart labels. */
export function shortMoney(paise: number) {
  const r = paise / 100
  if (r >= 100000) return `₹${(r / 100000).toFixed(r >= 1000000 ? 0 : 1)}L`
  if (r >= 1000) return `₹${(r / 1000).toFixed(r >= 10000 ? 0 : 1)}K`
  return `₹${Math.round(r)}`
}

export function invoiceStatusAfter(i: Invoice, paid: number): Invoice['status'] {
  if (paid >= i.total) return 'paid'
  if (paid > 0) return 'partly_paid'
  return i.dueOn < TODAY ? 'overdue' : 'due'
}

/** "98450 12345" → "919845012345" for wa.me and tel: links. */
export function phoneDigits(phone: string) {
  const d = phone.replace(/\D/g, '')
  return d.length === 10 ? `91${d}` : d
}

export const KIND_LABEL: Record<Activity['kind'], string> = {
  tenant: 'Tenants',
  rent: 'Rent',
  property: 'Properties',
  complaint: 'Complaints',
  team: 'Team',
  settings: 'Settings',
  expense: 'Expenses',
}

/* ------------------------------------------------------------------ tiny shared store */

function createStore<T>(initial: () => T) {
  let value: T | undefined
  const listeners = new Set<() => void>()
  const get = () => {
    if (value === undefined) value = initial()
    return value
  }
  return {
    get,
    set(next: T | ((v: T) => T)) {
      value = typeof next === 'function' ? (next as (v: T) => T)(get()) : next
      listeners.forEach((l) => l())
    },
    use(): T {
      return useSyncExternalStore((fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      }, get)
    },
  }
}

/** Which dashboard reminders were closed this visit. */
export const dismissedStore = createStore<string[]>(() => [])

/** Get-started flags that have no field in the sample data. */
export const onboardingStore = createStore(() => ({
  rentSettingsSaved: false,
  listingPublished: false,
}))

/** Extra/removed permission ticks per team member (the sample data only has roles). */
export const memberPermsStore = createStore<Record<string, string[]>>(() => ({}))

export function permsOf(memberId: string, role: string): string[] {
  return memberPermsStore.get()[memberId] ?? ROLE_PERMS[role] ?? []
}

/** History of the owner identity check. */
export const idHistoryStore = createStore<{ on: string; text: string; by: string }[]>(() => [
  {
    on: '2026-10-28T11:20:00',
    text: 'Started the identity check and saved a draft',
    by: getDb().business.ownerName,
  },
])

/* ------------------------------------------------------------------ notifications */

export interface Notif {
  id: string
  kind: 'rent' | 'complaint' | 'enquiry' | 'document' | 'checkin' | 'team' | 'plan'
  title: string
  text: string
  at: string
  to: string
  read: boolean
}

function initialNotifications(): Notif[] {
  const db = getDb()
  const overdue = db.invoices.filter((i) => i.status === 'overdue')
  const overdueSum = overdue.reduce((s, i) => s + i.total - i.paid, 0)
  const newComplaint =
    db.complaints.find((c) => c.status === 'open' && c.priority === 'urgent') ?? db.complaints[0]
  const enquiry = db.enquiries.find((e) => e.status === 'new')
  const upcoming = db.tenants.find((t) => t.status === 'upcoming')
  const expiring = db.properties
    .flatMap((p) => p.documents.map((d) => ({ p, d })))
    .find((x) => x.d.status !== 'ok')
  const inr = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`
  const list: Notif[] = [
    {
      id: 'nt1',
      kind: 'rent',
      title: `${overdue.length} tenants have overdue rent`,
      text: `${inr(overdueSum)} is pending. Send a reminder or record payments.`,
      at: `${TODAY}T09:00:00`,
      to: '/app/rent',
      read: false,
    },
  ]
  if (newComplaint)
    list.push({
      id: 'nt2',
      kind: 'complaint',
      title: `New complaint: ${newComplaint.title}`,
      text: `${newComplaint.number}${newComplaint.room ? ` · Room ${newComplaint.room}` : ''} · nobody assigned yet`,
      at: `${TODAY}T08:42:00`,
      to: `/app/complaints/${newComplaint.id}`,
      read: false,
    })
  if (enquiry)
    list.push({
      id: 'nt3',
      kind: 'enquiry',
      title: `New enquiry from ${enquiry.name}`,
      text: `Wants ${enquiry.sharing} sharing from ${enquiry.moveIn.slice(8)}/${enquiry.moveIn.slice(5, 7)}. ${enquiry.note}`,
      at: `${TODAY}T07:55:00`,
      to: '/app/enquiries',
      read: false,
    })
  if (upcoming)
    list.push({
      id: 'nt4',
      kind: 'checkin',
      title: `${upcoming.name} checks in soon`,
      text: `Moving in on ${upcoming.checkIn}. ID proof is still pending.`,
      at: `${addDaysISO(TODAY, -1)}T18:10:00`,
      to: `/app/tenants/${upcoming.id}`,
      read: false,
    })
  if (expiring)
    list.push({
      id: 'nt5',
      kind: 'document',
      title: `${expiring.d.kind} ${expiring.d.status === 'expired' ? 'has expired' : 'expires soon'}`,
      text: `${expiring.p.name} · ${expiring.d.title}. Upload the new one to keep your listing verified.`,
      at: `${addDaysISO(TODAY, -1)}T10:00:00`,
      to: `/app/properties/${expiring.p.id}`,
      read: true,
    })
  list.push(
    {
      id: 'nt6',
      kind: 'plan',
      title: 'Your Pro trial ends on 12 Nov',
      text: 'Choose a plan to keep reminders, reports and team access.',
      at: `${addDaysISO(TODAY, -2)}T09:00:00`,
      to: '/app/plan',
      read: true,
    },
    {
      id: 'nt7',
      kind: 'team',
      title: 'Prakash S has not accepted the invite yet',
      text: 'Send the invite again from the Team page.',
      at: `${addDaysISO(TODAY, -3)}T12:30:00`,
      to: '/app/team',
      read: true,
    },
  )
  return list
}

export const notificationsStore = createStore<Notif[]>(initialNotifications)

/** "Now" in the prototype: evening of TODAY, so sample times read as "2 hours ago". */
const NOW_BASE = new Date(`${TODAY}T21:00:00`).getTime()

/** "3 hours ago"; anything logged during this visit reads "just now". */
export function ago(iso: string) {
  return relativeTime(iso, Math.max(NOW_BASE, new Date(iso).getTime()))
}
