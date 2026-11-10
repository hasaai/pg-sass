/** Plain helpers (dates, CSV, phone numbers) for the operations screens. */
import { TODAY } from '../../data/seed'
import { parseDate, toISODate } from '../../lib/format'

/** Whole days from a to b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000)
}

export function addDays(iso: string, days: number) {
  const d = parseDate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** "Today", "Yesterday", "4 days ago" relative to the prototype's today. */
export function ageLabel(iso: string) {
  const n = daysBetween(iso.slice(0, 10), TODAY)
  if (n <= 0) return 'Today'
  if (n === 1) return 'Yesterday'
  return `${n} days ago`
}

/** Save rows as a CSV file in the browser. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const text = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
  const blob = new Blob([String.fromCharCode(0xfeff) + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Paise as plain rupees for CSV files. */
export function csvRupees(paise: number) {
  return (paise / 100).toFixed(2)
}

/** Phone numbers as wa.me / tel: links. */
export function phoneDigits(phone: string) {
  const d = phone.replace(/\D/g, '')
  return d.length === 10 ? `91${d}` : d
}

export function monthsBack(period: string, n: number) {
  const [y, m] = period.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y ?? 2026, (m ?? 1) - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function shortMonth(period: string) {
  return new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(parseDate(`${period}-01`))
}

/** A steady avatar colour from a name. */
export function hueOf(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${s}`
}
