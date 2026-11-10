/** Helpers for the tenants and rent screens: dates, bill maths and store actions. */
import { LAST_MONTH, THIS_MONTH, TODAY } from '../../data/seed'
import { placeLabel } from '../../data/selectors'
import { getDb, logActivity, newId, updateDb } from '../../data/store'
import type { Db } from '../../data/store'
import type { Invoice, InvoiceStatus, KycStatus, PayMode, Reminder, Tenant } from '../../data/types'
import { formatDate, formatMoney, formatMonth, parseDate, toISODate } from '../../lib/format'

export { LAST_MONTH, THIS_MONTH, TODAY }

/* ---------------------------------------------------------------- dates */

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000)
}

export function daysInMonth(period: string): number {
  const [y, m] = period.split('-').map(Number)
  return new Date(y ?? 2026, m ?? 1, 0).getDate()
}

/** "1 year 3 months", "3 weeks". */
export function tenure(from: string, to = TODAY): string {
  const days = Math.max(0, daysBetween(from, to))
  if (days === 0) return 'From today'
  if (days < 31)
    return days < 7 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.floor(days / 7)} weeks`
  const months = Math.floor(days / 30.4)
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts = []
  if (y) parts.push(`${y} year${y === 1 ? '' : 's'}`)
  if (m) parts.push(`${m} month${m === 1 ? '' : 's'}`)
  return parts.join(' ')
}

/** Rent for the days left in the move-in month. */
export function proRata(rent: number, moveIn: string) {
  const period = moveIn.slice(0, 7)
  const total = daysInMonth(period)
  const day = Number(moveIn.slice(8, 10))
  const days = total - day + 1
  const amount = Math.round((rent * days) / total / 100) * 100
  return { amount, days, total, period }
}

/* ---------------------------------------------------------------- bills */

export function statusFor(inv: Pick<Invoice, 'total' | 'paid' | 'dueOn'>): InvoiceStatus {
  if (inv.paid >= inv.total) return 'paid'
  if (inv.paid > 0) return 'partly_paid'
  return inv.dueOn < TODAY ? 'overdue' : 'due'
}

export function isUnpaid(inv: Invoice) {
  return inv.status !== 'paid'
}

/** Late fee as per settings: ₹X a day after the grace days. */
export function lateFeeFor(
  settings: Db['settings'],
  inv: Invoice,
): { days: number; amount: number } {
  if (inv.status === 'paid' || inv.dueOn >= TODAY) return { days: 0, amount: 0 }
  const late = daysBetween(inv.dueOn, TODAY) - settings.lateFeeAfterDays
  if (late <= 0) return { days: 0, amount: 0 }
  if (inv.lines.some((l) => l.label.startsWith('Late fee'))) return { days: 0, amount: 0 }
  return { days: late, amount: late * settings.lateFeePerDay }
}

export function nextReceipt(db: Db): string {
  const max = db.payments.reduce(
    (m, p) => Math.max(m, Number(p.receipt.replace(/\D/g, '')) || 0),
    0,
  )
  return `RCPT-${String(max + 1).padStart(5, '0')}`
}

export function nextInvoiceNumber(db: Db, period: string): string {
  const max = db.invoices.reduce((m, i) => Math.max(m, Number(i.number.slice(-4)) || 0), 0)
  return `INV-${period.replace('-', '')}-${String(max + 1).padStart(4, '0')}`
}

export const PAY_MODE_OPTIONS: { value: PayMode; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
]

export interface PaymentInput {
  invoiceId: string
  amount: number
  mode: PayMode
  reference: string
  paidOn: string
  note?: string
  lateFee?: number
  discount?: number
  by: string
}

/** Adds the payment (and any late fee / discount lines) and returns the receipt number. */
export function recordPayment(input: PaymentInput): string {
  const receipt = nextReceipt(getDb())
  updateDb((d) => {
    const inv = d.invoices.find((i) => i.id === input.invoiceId)
    if (!inv) return
    const lines = [...inv.lines]
    if (input.lateFee) lines.push({ label: 'Late fee', amount: input.lateFee })
    if (input.discount) lines.push({ label: 'Discount', amount: -input.discount })
    inv.lines = lines
    inv.total = lines.reduce((s, l) => s + l.amount, 0)
    inv.paid += input.amount
    inv.status = statusFor(inv)
    const tenant = d.tenants.find((t) => t.id === inv.tenantId)
    d.payments.unshift({
      id: newId('pay'),
      receipt,
      invoiceId: inv.id,
      tenantId: inv.tenantId,
      propertyId: inv.propertyId,
      amount: input.amount,
      mode: input.mode,
      reference: input.reference.trim(),
      paidOn: input.paidOn,
      collectedBy: input.by,
    })
    logActivity(d, {
      kind: 'rent',
      by: input.by,
      action: `Recorded a payment of ${formatMoney(input.amount)} by ${MODE_WORD[input.mode]} (${receipt})${input.note ? ` – ${input.note}` : ''}`,
      target: tenant?.name ?? inv.number,
      propertyId: inv.propertyId,
    })
  })
  return receipt
}

const MODE_WORD: Record<PayMode, string> = {
  upi: 'UPI',
  cash: 'cash',
  bank: 'bank transfer',
  card: 'card',
}

export function reminderKind(inv: Invoice): Reminder['kind'] {
  if (inv.dueOn < TODAY) return 'overdue'
  if (inv.dueOn === TODAY) return 'due_day'
  return 'before_due'
}

/** Send reminders for the given bills. Returns how many went out. */
export function sendReminders(
  invoiceIds: string[],
  channel: Reminder['channel'],
  by: string,
): number {
  const db = getDb()
  const list = db.invoices.filter((i) => invoiceIds.includes(i.id) && i.status !== 'paid')
  if (!list.length) return 0
  updateDb((d) => {
    for (const inv of list) {
      d.reminders.unshift({
        id: newId('rem'),
        tenantId: inv.tenantId,
        invoiceId: inv.id,
        channel,
        sentOn: TODAY,
        status: 'sent',
        kind: reminderKind(inv),
      })
    }
    logActivity(d, {
      kind: 'rent',
      by,
      action: `Sent ${CHANNEL_WORD[channel]} rent reminders to ${list.length} tenant${list.length === 1 ? '' : 's'}`,
      target: formatMonth(list[0]?.period ?? THIS_MONTH) + ' rent',
    })
  })
  return list.length
}

export const CHANNEL_WORD: Record<Reminder['channel'], string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'email',
}

/* ---------------------------------------------------------------- tenants */

export function digits(phone: string) {
  return phone.replace(/\D/g, '')
}

export function waLink(phone: string, text?: string) {
  const d = digits(phone)
  const full = d.length === 10 ? `91${d}` : d
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function telLink(phone: string) {
  return `tel:+91${digits(phone).slice(-10)}`
}

/** "Room 203 · Bed B" for a bed id. */
export function bedPlace(db: Db, bedId: string | undefined): string {
  const bed = db.beds.find((b) => b.id === bedId)
  const room = db.rooms.find((r) => r.id === bed?.roomId)
  if (!bed || !room) return '—'
  return room.sharing === 1 ? `Room ${room.number}` : `Room ${room.number} · Bed ${bed.label}`
}

export function tenantPlace(db: Db, t: Tenant | undefined) {
  return placeLabel(db, t)
}

/** Notes are kept as lines "YYYY-MM-DD · Name: text"; older free text shows as one note. */
export function parseNotes(notes: string): { on?: string; by?: string; text: string }[] {
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(\d{4}-\d{2}-\d{2}) · ([^:]+): (.*)$/.exec(line)
      return m ? { on: m[1], by: m[2], text: m[3] ?? '' } : { text: line }
    })
}

export function noteLine(by: string, text: string) {
  return `${TODAY} · ${by}: ${text.replace(/\n/g, ' ')}`
}

export function maskId(idType: string, last4: string) {
  if (!last4) return '—'
  if (idType.startsWith('Aadhaar')) return `XXXX XXXX ${last4}`
  return `••••${last4}`
}

/* ---------------------------------------------------------------- files */

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const text = rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
  const blob = new Blob([`\ufeff${text}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Rupees as plain text for CSV (no ₹ sign so spreadsheets read them as numbers). */
export function csvRupees(paise: number) {
  return (paise / 100).toFixed(2)
}

/** ID check status words. */
export const KYC = {
  verified: { label: 'ID checked', tone: 'good' },
  pending: { label: 'ID pending', tone: 'warn' },
  missing: { label: 'No ID yet', tone: 'bad' },
} as const satisfies Record<KycStatus, { label: string; tone: string }>

/** The rent reminder message with the tenant's details filled in. */
export function reminderText(opts: {
  name: string
  amount: number
  period: string
  dueOn: string
  upiId: string
  business: string
  lateDays?: number
}) {
  const first = opts.name.split(' ')[0]
  const when =
    opts.lateDays && opts.lateDays > 0
      ? `was due on ${formatDate(opts.dueOn)} (${opts.lateDays} ${opts.lateDays === 1 ? 'day' : 'days'} ago)`
      : `is due on ${formatDate(opts.dueOn)}`
  return `Hi ${first}, your rent of ${formatMoney(opts.amount)} for ${formatMonth(opts.period)} ${when}.\n\nPay by UPI to ${opts.upiId} or at the office.\n\n– ${opts.business}`
}
