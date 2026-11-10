/** Small helpers and the words shown for platform codes. */
import { TODAY } from '../../data/seed'
import { plural } from '../../lib/format'
import type { PlatformBusiness, PlatformStaffMember, VerificationItem } from '../../data/types'

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function daysBetween(from: string, to: string) {
  const a = new Date(`${from.slice(0, 10)}T00:00:00`).getTime()
  const b = new Date(`${to.slice(0, 10)}T00:00:00`).getTime()
  return Math.round((b - a) / 86400000)
}

/** The prototype's clock: today's date with the real time of day (for logs). Call in handlers only. */
export function stamp() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${TODAY}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`
}

/** "2 Nov, 9:12 am" */
export function formatDateTime(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

/** "today", "yesterday", "5 days ago" measured from the prototype's TODAY. */
export function daysAgo(iso: string) {
  const n = daysBetween(iso, TODAY)
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  if (n < 30) return `${n} days ago`
  const months = Math.round(n / 30)
  return months === 1 ? 'a month ago' : `${months} months ago`
}

export const PLAN_STATUS: Record<PlatformBusiness['planStatus'], { label: string; tone: string }> =
  {
    trial: { label: 'Free trial', tone: 'info' },
    active: { label: 'Paying', tone: 'good' },
    past_due: { label: 'Payment failed', tone: 'bad' },
    ended: { label: 'Plan ended', tone: 'neutral' },
  }

export const BUSINESS_STATUS = {
  active: { label: 'Active', tone: 'good' },
  suspended: { label: 'Suspended', tone: 'bad' },
} as const

export const CHECK_STATUS: Record<VerificationItem['status'], { label: string; tone: string }> = {
  submitted: { label: 'Waiting', tone: 'info' },
  under_review: { label: 'Being checked', tone: 'warn' },
  more_info: { label: 'More information asked', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Not approved', tone: 'bad' },
}

export const PAYMENT_STATUS = {
  paid: { label: 'Paid', tone: 'good' },
  failed: { label: 'Failed', tone: 'bad' },
  refunded: { label: 'Refunded', tone: 'neutral' },
} as const

export const GATEWAY = { razorpay: 'Razorpay', cashfree: 'Cashfree' } as const

export const TICKET_STATUS = {
  open: { label: 'Open', tone: 'bad' },
  waiting: { label: 'Waiting for customer', tone: 'warn' },
  solved: { label: 'Solved', tone: 'good' },
} as const

export const STAFF_ROLES: Record<
  PlatformStaffMember['role'],
  { label: string; description: string }
> = {
  platform_owner: {
    label: 'Platform owner',
    description: 'Everything, including plans, payments, SMS keys and the platform team.',
  },
  finance_admin: {
    label: 'Finance admin',
    description: 'Plans, plan payments, refunds and failed payments. Can see businesses.',
  },
  support_agent: {
    label: 'Support agent',
    description: 'Support tickets, business details and the support view of an owner’s app.',
  },
  verification_reviewer: {
    label: 'Verification reviewer',
    description: 'Owner and property checks: open documents and approve or ask for more.',
  },
}

export const PERSON = 'San (Founder)'
export const PERSON_SHORT = 'San'

export function waitingLabel(item: VerificationItem) {
  const days = daysBetween(item.submittedOn, TODAY)
  if (item.status === 'approved' || item.status === 'rejected') return 'Done'
  if (days <= 0) return 'Sent today'
  return `Waiting ${plural(days, 'day')}`
}
