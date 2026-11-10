/**
 * Extra prototype data this module needs that the shared store has no place for yet
 * (attendance marks, salary advances, listing settings, complaint photos …). Same pattern as
 * data/store.ts: read with `useExtras`, change with `updateExtras`.
 */
import { useSyncExternalStore } from 'react'

export type AttendanceMark = 'present' | 'absent' | 'leave'

export interface Advance {
  id: string
  on: string
  amount: number
  note: string
  recovered: boolean
}

export interface ListingSettings {
  headline: string
  description: string
  sharings: number[]
  priceFrom: number
  showPhone: boolean
  showWhatsApp: boolean
  published: boolean
}

export interface Extras {
  /** staffId → day of November → mark */
  attendance: Record<string, Record<number, AttendanceMark>>
  advances: Record<string, Advance[]>
  staffDocs: Record<string, { id: string; title: string; addedOn: string }[]>
  staffLeftOn: Record<string, string>
  /** complaintId → photo hues */
  complaintPhotos: Record<string, number[]>
  /** noticeId → date it will go out */
  noticeSchedule: Record<string, string>
  enquiryVisits: Record<string, { date: string; time: string }>
  lostReasons: Record<string, string>
  /** propertyId → saved listing settings (missing = defaults from the property) */
  listings: Record<string, ListingSettings>
  listingStats: Record<string, { views: number; calls: number }>
}

function initial(): Extras {
  return {
    attendance: {
      s1: { 1: 'present', 2: 'present' },
      s2: { 1: 'present', 2: 'present' },
      s3: { 1: 'present', 2: 'present' },
      s4: { 1: 'present', 2: 'absent' },
      s5: { 1: 'present', 2: 'present' },
      s6: {},
      s7: { 1: 'leave', 2: 'leave', 3: 'leave', 4: 'leave', 5: 'leave' },
    },
    advances: {
      s4: [
        {
          id: 'adv1',
          on: '2026-10-18',
          amount: 200000,
          note: 'Daughter’s school fees',
          recovered: false,
        },
      ],
      s2: [
        {
          id: 'adv2',
          on: '2026-09-05',
          amount: 300000,
          note: 'Travel to home town',
          recovered: true,
        },
      ],
    },
    staffDocs: {
      s1: [
        { id: 'sd1', title: 'Aadhaar card (masked)', addedOn: '2025-04-01' },
        { id: 'sd2', title: 'Police verification', addedOn: '2025-04-20' },
      ],
      s2: [{ id: 'sd3', title: 'Aadhaar card (masked)', addedOn: '2026-01-20' }],
      s3: [{ id: 'sd4', title: 'Voter ID', addedOn: '2025-05-10' }],
      s5: [
        { id: 'sd5', title: 'Aadhaar card (masked)', addedOn: '2025-04-01' },
        { id: 'sd6', title: 'Security agency letter', addedOn: '2025-04-01' },
      ],
      s6: [{ id: 'sd7', title: 'Electrician licence', addedOn: '2025-08-01' }],
      s7: [{ id: 'sd8', title: 'Aadhaar card (masked)', addedOn: '2026-02-01' }],
    },
    staffLeftOn: {},
    complaintPhotos: { c1: [200], c3: [30], c7: [20, 45], c8: [260], c9: [190] },
    noticeSchedule: {},
    enquiryVisits: { q2: { date: '2026-11-03', time: '18:00' } },
    lostReasons: { q6: 'Found a cheaper place' },
    listings: {},
    listingStats: { p1: { views: 412, calls: 38 }, p2: { views: 268, calls: 21 } },
  }
}

let state: Extras = initial()
const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useExtras<T>(select: (x: Extras) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

export function updateExtras(change: (draft: Extras) => void) {
  const draft = structuredClone(state)
  change(draft)
  state = draft
  listeners.forEach((fn) => fn())
}
