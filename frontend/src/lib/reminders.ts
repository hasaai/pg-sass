import type { DueReminder, EmailResult } from '../api/types'
import { parseDate, plural, todayISO } from './format'

/** Human summary of what the email run did. Exported for tests. */
export function emailSummary(r: EmailResult): string {
  const parts = [`${plural(r.sent, 'email')} sent`]
  if (r.skipped_recent) parts.push(`${r.skipped_recent} skipped (reminded in the last 3 days)`)
  if (r.no_email) parts.push(`${r.no_email} without an email address`)
  if (r.failed) parts.push(`${r.failed} failed`)
  return `${parts.join(', ')}.`
}

/** "3 days late", "Due today" or "Due in 2 days". Exported for tests. */
export function dueLabel(r: DueReminder, today = todayISO()): { value: string; label: string } {
  if (r.days_overdue > 0)
    return { value: 'overdue', label: `${plural(r.days_overdue, 'day')} late` }
  const days = Math.round(
    (parseDate(r.due_date).getTime() - parseDate(today).getTime()) / 86_400_000,
  )
  if (days <= 0) return { value: 'issued', label: 'Due today' }
  return { value: 'new', label: `Due in ${plural(days, 'day')}` }
}
