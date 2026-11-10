/**
 * Platform-only settings that the shared sample database does not hold (plan catalogue,
 * platform switches, amenity catalogue edits, ticket conversations, review history, notes).
 * Same pattern as data/store.ts: read with `useExtras`, change with `updateExtras`.
 */
import { useSyncExternalStore } from 'react'

import { AMENITY_CATALOG, plans as seedPlans, TODAY } from '../../data/seed'
import { addDays } from './util'

export interface PlanRow {
  code: string
  name: string
  pricePerMonth: number
  pricePerYear: number
  limits: {
    properties: number | null
    beds: number | null
    team: number | null
    tenants: number | null
  }
  features: string[]
  popular: boolean
  active: boolean
}

export interface ReviewEvent {
  on: string
  by: string
  text: string
  tone: 'neutral' | 'info' | 'good' | 'warn' | 'bad'
}

export interface TicketMessage {
  id: string
  from: 'customer' | 'team' | 'note'
  by: string
  at: string
  text: string
}

export interface AmenityRow {
  key: string
  name: string
  group: string
  hidden: boolean
}

export interface Extras {
  plans: PlanRow[]
  /** Paid plan features that can be ticked on a plan card. */
  featureCatalog: string[]
  trialEnds: Record<string, string>
  notes: Record<string, { at: string; by: string; text: string }[]>
  messages: Record<string, { at: string; text: string }[]>
  reviewHistory: Record<string, ReviewEvent[]>
  checklists: Record<string, Record<string, boolean>>
  suspendReasons: Record<string, string>
  supportView: string | null
  tickets: Record<string, TicketMessage[]>
  switches: { marketplace: boolean; whatsapp: boolean; csvImport: boolean; tenantApp: boolean }
  amenities: AmenityRow[]
  legal: { kind: 'terms' | 'privacy'; version: string; publishedOn: string; summary: string }[]
  maintenance: { on: boolean; message: string }
  emailsSent: Record<string, string>
}

const FEATURE_CATALOG = [
  'Rooms & beds',
  'Tenants',
  'Rent tracking',
  'Receipts',
  'WhatsApp & SMS reminders',
  'Complaints',
  'Notices',
  'Expenses',
  'Staff & salaries',
  'Profit reports',
  'Online listing',
  'CSV import',
  'Team access controls',
  'Priority support',
  'Custom receipts',
]

function initial(): Extras {
  return {
    plans: seedPlans.map((p) => ({
      code: p.code,
      name: p.name,
      pricePerMonth: p.pricePerMonth,
      pricePerYear: p.pricePerYear,
      limits: { ...p.limits },
      features: [...p.features],
      popular: Boolean(p.popular),
      active: true,
    })),
    featureCatalog: FEATURE_CATALOG,
    trialEnds: { b1: '2026-11-12', b13: addDays(TODAY, 5) },
    notes: {
      b1: [
        {
          at: '2026-10-28T11:20:00',
          by: 'Rohit',
          text: 'Called Asha – wants to move Green Nest to Pro before December. Follow up after trial.',
        },
      ],
      b7: [
        {
          at: '2026-11-01T16:05:00',
          by: 'Meghana',
          text: 'Card payment failed twice. Owner says the bank blocked online payments; will pay by UPI.',
        },
      ],
    },
    messages: {},
    reviewHistory: {
      v1: [
        {
          on: '2026-10-29T10:12:00',
          by: 'Asha Rao',
          text: 'Sent for checking with 3 documents and 6 photos.',
          tone: 'info',
        },
        { on: '2026-10-30T12:40:00', by: 'Divya', text: 'Started checking.', tone: 'info' },
      ],
      v4: [
        { on: '2026-10-28T09:02:00', by: 'Sunitha R', text: 'Sent for checking.', tone: 'info' },
        { on: '2026-10-29T15:30:00', by: 'Divya', text: 'Started checking.', tone: 'info' },
      ],
      v5: [
        { on: '2026-10-25T18:45:00', by: 'Nagaraj K', text: 'Sent for checking.', tone: 'info' },
        {
          on: '2026-10-27T11:10:00',
          by: 'Divya',
          text: 'Asked for more information: trade licence photo is blurred; please upload a clear copy.',
          tone: 'warn',
        },
      ],
      v7: [
        { on: '2026-10-20T08:30:00', by: 'Kiran Shetty', text: 'Sent for checking.', tone: 'info' },
        {
          on: '2026-10-21T14:00:00',
          by: 'Divya',
          text: 'Approved. All documents match.',
          tone: 'good',
        },
      ],
    },
    checklists: {},
    suspendReasons: { b13: 'Owner asked to pause the account while the building is repaired.' },
    supportView: null,
    tickets: {
      st1: [
        {
          id: 'm1',
          from: 'customer',
          by: 'Venkatesh Murthy',
          at: '2026-11-02T08:42:00',
          text: 'Since yesterday the rent reminders on WhatsApp are not reaching tenants. SMS is working.',
        },
        {
          id: 'm2',
          from: 'team',
          by: 'Rohit',
          at: '2026-11-02T09:10:00',
          text: 'Thanks for telling us. Checking the WhatsApp delivery log for your account now.',
        },
      ],
      st2: [
        {
          id: 'm3',
          from: 'customer',
          by: 'Mahesh Gowda',
          at: '2026-11-01T13:15:00',
          text: 'One tenant was travelling for 2 weeks. How do I give a discount only for November?',
        },
        {
          id: 'm4',
          from: 'team',
          by: 'Rohit',
          at: '2026-11-01T14:02:00',
          text: 'Open the tenant’s November bill → “Give discount”, type the amount and a reason. It will not change December. Did that work?',
        },
      ],
      st3: [
        {
          id: 'm5',
          from: 'customer',
          by: 'Ramesh Babu',
          at: '2026-11-01T19:30:00',
          text: 'I paid ₹499 for Starter by UPI, money left my account but the app still says payment failed.',
        },
      ],
      st4: [
        {
          id: 'm6',
          from: 'customer',
          by: 'Harish Reddy',
          at: '2026-10-29T10:00:00',
          text: 'We are opening a 6th PG in Bellandur. Can we add it?',
        },
        {
          id: 'm7',
          from: 'team',
          by: 'Meghana',
          at: '2026-10-29T10:40:00',
          text: 'Yes – you are on Business, which has no limit on properties. Add it from Properties → Add property.',
        },
        {
          id: 'm8',
          from: 'customer',
          by: 'Harish Reddy',
          at: '2026-10-29T11:05:00',
          text: 'Done, thank you!',
        },
      ],
      st5: [
        {
          id: 'm9',
          from: 'customer',
          by: 'Geetha M',
          at: '2026-10-31T17:20:00',
          text: 'My account says switched off. I did not ask for this. My tenants cannot see bills.',
        },
        {
          id: 'm10',
          from: 'note',
          by: 'Rohit',
          at: '2026-10-31T17:45:00',
          text: 'Account was suspended after 3 failed payments. Check with Finance before switching it on.',
        },
      ],
    },
    switches: { marketplace: false, whatsapp: true, csvImport: true, tenantApp: true },
    amenities: AMENITY_CATALOG.map((a) => ({
      key: a.key,
      name: a.name,
      group: a.group,
      hidden: false,
    })),
    legal: [
      {
        kind: 'terms',
        version: '2026-11',
        publishedOn: '2026-11-02',
        summary: 'Owner sign-up with mobile code; plan trial is 14 days.',
      },
      {
        kind: 'terms',
        version: '2026-06',
        publishedOn: '2026-06-01',
        summary: 'First public version.',
      },
      {
        kind: 'privacy',
        version: '2026-11',
        publishedOn: '2026-11-02',
        summary: 'Owner ID documents: only last 4 characters are kept on screen.',
      },
      {
        kind: 'privacy',
        version: '2026-06',
        publishedOn: '2026-06-01',
        summary: 'First public version.',
      },
    ],
    maintenance: {
      on: false,
      message: 'PG Manager will be down for 15 minutes on Sunday at 2 am for an update.',
    },
    emailsSent: {},
  }
}

let state: Extras = initial()
const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Read platform-only settings. Return values straight from the store or primitives. */
export function useExtras<T>(select: (x: Extras) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

export function updateExtras(change: (draft: Extras) => void) {
  const draft = structuredClone(state)
  change(draft)
  state = draft
  listeners.forEach((fn) => fn())
}
