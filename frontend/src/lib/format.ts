/** All amounts travel as integer paise; people see and type rupees. */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

export function formatMoney(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—'
  return inr.format(paise / 100)
}

/** Parse what someone typed in a rupee field ("12,500.50") into paise, or null. */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole = '0', fraction = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export function paiseToRupeesInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2)
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })

/** Dates from the API are plain YYYY-MM-DD; parse them as local dates. */
export function parseDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function formatDate(value: string | null | undefined): string {
  return value ? dateFmt.format(parseDate(value)) : '—'
}

export function formatMonth(period: string): string {
  return monthFmt.format(parseDate(period.length === 7 ? `${period}-01` : period))
}

/** A local date as YYYY-MM-DD (not toISOString, which shifts to UTC and can lose a day in IST). */
export function toISODate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

/** Same day `months` later (clamped to the month's end: 31 Jan + 1 month = 28/29 Feb). */
export function addMonths(value: string, months: number): string {
  const d = parseDate(value)
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), lastDay))
  return toISODate(target)
}

export function currentPeriod(): string {
  return todayISO().slice(0, 7)
}

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number)
  const date = new Date(y ?? 1970, (m ?? 1) - 1 + months, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** "3 days ago", "in 2 hours". */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000
  const fmt = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, secs] of steps) {
    if (Math.abs(diff) >= secs) return fmt.format(Math.round(diff / secs), unit)
  }
  return 'just now'
}

/** "Demo Stays Pvt Ltd" → "DS" (for avatars). */
export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z0-9]/.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  )
}
