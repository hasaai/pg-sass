/** Changes to complaints, shared by the board, the list and the detail page. */
import { TODAY } from '../../data/seed'
import { COMPLAINT_STATUS, STAFF_ROLE } from '../../data/selectors'
import { logActivity, updateDb } from '../../data/store'
import type { Db } from '../../data/store'
import type { Complaint, ComplaintStatus } from '../../data/types'

export const NEXT_STATUS: Partial<Record<ComplaintStatus, { to: ComplaintStatus; label: string }>> =
  {
    open: { to: 'in_progress', label: 'Start fixing' },
    in_progress: { to: 'resolved', label: 'Mark fixed' },
    resolved: { to: 'closed', label: 'Close' },
  }

export const STATUS_ORDER: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'closed']

export function changeComplaint(
  id: string,
  by: string,
  change: (c: Complaint) => void,
  note?: { text: string; activity?: string },
) {
  updateDb((db) => {
    const c = db.complaints.find((x) => x.id === id)
    if (!c) return
    change(c)
    if (note) {
      c.updates = [...c.updates, { on: TODAY, by, text: note.text }]
      if (note.activity) {
        logActivity(db, {
          by,
          kind: 'complaint',
          action: note.activity,
          target: c.title,
          propertyId: c.propertyId,
        })
      }
    }
  })
}

export function setComplaintStatus(c: Complaint, to: ComplaintStatus, by: string) {
  const words: Record<ComplaintStatus, string> = {
    open: `Reopened complaint ${c.number}`,
    in_progress: `Started work on complaint ${c.number}`,
    resolved: `Marked complaint ${c.number} as fixed`,
    closed: `Closed complaint ${c.number}`,
  }
  changeComplaint(
    c.id,
    by,
    (x) => {
      x.status = to
      if (to === 'resolved') x.resolvedOn = TODAY
      if (to === 'open' || to === 'in_progress') x.resolvedOn = undefined
    },
    { text: `Status changed to “${COMPLAINT_STATUS[to].label}”.`, activity: words[to] },
  )
}

/** Staff list for "Assign to". */
export function staffOptions(db: Db, propertyId?: string) {
  return db.staff
    .filter((s) => s.status !== 'left')
    .filter((s) => !propertyId || s.propertyIds.includes(propertyId))
    .map((s) => ({ value: s.name, label: `${s.name} · ${STAFF_ROLE[s.role]}` }))
}
