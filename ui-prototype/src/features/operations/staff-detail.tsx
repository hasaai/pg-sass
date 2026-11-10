/** One staff member: details, attendance, salary history, advances and documents. */
import {
  ArrowLeft,
  Banknote,
  FileText,
  HandCoins,
  HardHat,
  LogOut,
  Pencil,
  Phone,
  Plus,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { Avatar, DetailList, Money, NoAccess, Section } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { THIS_MONTH, TODAY } from '../../data/seed'
import { STAFF_ROLE } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Staff } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney, formatMonth, rupeesToPaise } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import type { AttendanceMark } from './extras'
import { updateExtras, useExtras } from './extras'
import { PaySalariesDialog, StaffDialog } from './staff-parts'
import { STAFF_STATUS } from './staff'
import { hueOf, phoneDigits } from './helpers'

export function StaffDetailPage() {
  const { id = '' } = useParams()
  const s = useDb((db) => db.staff.find((x) => x.id === id))
  useBreadcrumbs([
    { label: 'Staff & salaries', to: '/app/staff' },
    { label: s?.name ?? 'Not found' },
  ])
  const { can } = useSession()
  if (!can('salaries.manage')) return <NoAccess what="staff and salaries" />
  if (!s) {
    return (
      <EmptyState
        icon={<HardHat />}
        title="This person was not found"
        actions={
          <Button asChild variant="outline">
            <Link to="/app/staff">Back to staff</Link>
          </Button>
        }
      />
    )
  }
  return <Profile s={s} />
}

const MARK: Record<AttendanceMark, { label: string; short: string; cls: string }> = {
  present: {
    label: 'Present',
    short: 'P',
    cls: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  },
  absent: { label: 'Absent', short: 'A', cls: 'border-red-300 bg-red-50 text-red-700' },
  leave: { label: 'On leave', short: 'L', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
}

function Profile({ s }: { s: Staff }) {
  const { person } = useSession()
  const properties = useDb((db) => db.properties)
  const marks = useExtras((x) => x.attendance[s.id])
  const advances = useExtras((x) => x.advances[s.id])
  const docs = useExtras((x) => x.staffDocs[s.id])
  const leftOn = useExtras((x) => x.staffLeftOn[s.id])
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [giving, setGiving] = useState(false)
  const [addingDoc, setAddingDoc] = useState(false)

  const today = Number(TODAY.slice(8))
  const year = s.salaryPaid.filter((p) => p.period.startsWith(THIS_MONTH.slice(0, 4)))
  const owed = (advances ?? []).filter((a) => !a.recovered).reduce((t, a) => t + a.amount, 0)
  const counts = { present: 0, absent: 0, leave: 0 }
  for (const m of Object.values(marks ?? {})) counts[m] += 1

  function cycle(day: number) {
    const now = marks?.[day]
    const order: (AttendanceMark | undefined)[] =
      day > today ? [undefined, 'leave'] : [undefined, 'present', 'absent', 'leave']
    const next = order[(order.indexOf(now) + 1) % order.length]
    updateExtras((x) => {
      const m = (x.attendance[s.id] ??= {})
      if (next) m[day] = next
      else delete m[day]
    })
    const present = Object.entries({ ...marks, [day]: next }).filter(
      ([d, m]) => Number(d) <= today && m === 'present',
    ).length
    updateDb((d) => {
      const x = d.staff.find((y) => y.id === s.id)
      if (x) x.attendance = present
    })
    toast.success(`${day} Nov: ${next ? MARK[next].label : 'cleared'}`)
  }

  function markLeft() {
    updateDb((d) => {
      const x = d.staff.find((y) => y.id === s.id)
      if (x) x.status = 'left'
      logActivity(d, {
        by: person.name,
        kind: 'team',
        action: 'Marked as left',
        target: s.name,
        propertyId: s.propertyIds[0],
      })
    })
    updateExtras((x) => void (x.staffLeftOn[s.id] = TODAY))
    toast.success(`${s.name} marked as left`)
    setLeaving(false)
  }

  function rejoin() {
    updateDb((d) => {
      const x = d.staff.find((y) => y.id === s.id)
      if (x) x.status = 'active'
    })
    updateExtras((x) => void delete x.staffLeftOn[s.id])
    toast.success(`${s.name} is working again`)
  }

  // November starts on a Sunday; the grid starts on Monday.
  const firstWeekday = (new Date(2026, 10, 1).getDay() + 6) % 7
  const days = Array.from({ length: 30 }, (_, i) => i + 1)

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            to="/app/staff"
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Staff & salaries
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={s.name} hue={hueOf(s.name)} size="lg" />
            <span>{s.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {STAFF_ROLE[s.role]} · {s.phone}
            <Badge tone={STAFF_STATUS[s.status].tone} dot>
              {STAFF_STATUS[s.status].label}
              {leftOn ? ` on ${formatDate(leftOn)}` : ''}
            </Badge>
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`tel:+${phoneDigits(s.phone)}`}>
                <Phone /> Call
              </a>
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            {s.status === 'left' ? (
              <Button variant="outline" onClick={rejoin}>
                Working again
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setLeaving(true)}>
                  <LogOut /> Mark as left
                </Button>
                <Button onClick={() => setPaying(true)}>
                  <Banknote /> Pay salary
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Section title="Details">
            <DetailList
              items={[
                ['Work', STAFF_ROLE[s.role]],
                [
                  'Works at',
                  s.propertyIds.map((id) => properties.find((p) => p.id === id)?.name).join(', '),
                ],
                ['Shift', s.shift],
                ['Monthly salary', formatMoney(s.salary)],
                ['Joined on', formatDate(s.joinedOn)],
                ['ID proof', s.idProof ? 'Added' : 'Not added'],
              ]}
            />
          </Section>

          <Section
            title="Attendance · November 2026"
            description="Tap a day to mark present, absent or on leave. Future days can be marked as leave."
            actions={
              <span className="flex gap-1.5 text-xs">
                <Badge tone="good">{counts.present} present</Badge>
                <Badge tone="bad">{counts.absent} absent</Badge>
                <Badge tone="warn">{counts.leave} leave</Badge>
              </span>
            }
          >
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <span key={d} className="pb-1 text-[11px] font-medium text-muted-foreground">
                  {d}
                </span>
              ))}
              {Array.from({ length: firstWeekday }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {days.map((day) => {
                const m = marks?.[day]
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => cycle(day)}
                    disabled={s.status === 'left'}
                    aria-label={`${day} November: ${m ? MARK[m].label : 'not marked'}`}
                    className={cn(
                      'flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors disabled:opacity-50 sm:aspect-auto sm:h-12',
                      m
                        ? MARK[m].cls
                        : day > today
                          ? 'border-dashed text-muted-foreground'
                          : 'bg-card hover:bg-secondary',
                      day === today && 'ring-2 ring-primary/40',
                    )}
                  >
                    <span className="tabular-nums">{day}</span>
                    {m && <span className="text-[10px] font-semibold">{MARK[m].short}</span>}
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title="Salary history" bodyClassName="p-0">
            {s.salaryPaid.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No salary paid yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Month</TH>
                    <TH>Paid on</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {[...s.salaryPaid].reverse().map((p) => (
                    <TR key={p.period + p.paidOn}>
                      <TD className="font-medium whitespace-nowrap">{formatMonth(p.period)}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDate(p.paidOn)}
                      </TD>
                      <TD className="text-right">
                        <Money value={p.amount} />
                        {p.amount < s.salary && (
                          <p className="text-[11px] text-muted-foreground">advance taken back</p>
                        )}
                      </TD>
                      <TD>
                        <Badge tone="good">Paid</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="This year">
            <p className="text-2xl font-semibold tabular-nums">
              <Money value={year.reduce((t, p) => t + p.amount, 0)} />
            </p>
            <p className="text-sm text-muted-foreground">paid in {year.length} salaries</p>
          </Section>

          <Section
            title="Advances"
            description={owed ? `${formatMoney(owed)} still to take back` : 'Nothing to take back'}
            actions={
              s.status !== 'left' && (
                <Button size="sm" variant="outline" onClick={() => setGiving(true)}>
                  <HandCoins /> Give advance
                </Button>
              )
            }
          >
            {advances?.length ? (
              <ul className="grid gap-3">
                {advances.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">
                        <Money value={a.amount} />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.on)} · {a.note}
                      </p>
                    </div>
                    <Badge tone={a.recovered ? 'good' : 'warn'}>
                      {a.recovered ? 'Taken back' : 'Pending'}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No advances given.</p>
            )}
          </Section>

          <Section
            title="Documents"
            actions={
              <Button size="sm" variant="outline" onClick={() => setAddingDoc(true)}>
                <Plus /> Add
              </Button>
            }
          >
            {docs?.length ? (
              <ul className="grid gap-2.5">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2.5 text-sm">
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(d.addedOn)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No documents yet. Add their ID proof.</p>
            )}
          </Section>
        </div>
      </div>

      {editing && <StaffDialog staff={s} onClose={() => setEditing(false)} />}
      {paying && <PaySalariesDialog only={s.id} onClose={() => setPaying(false)} />}
      {giving && <AdvanceDialog s={s} by={person.name} onClose={() => setGiving(false)} />}
      {addingDoc && <DocDialog s={s} onClose={() => setAddingDoc(false)} />}
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={`Mark ${s.name} as left?`}
        confirmLabel="Mark as left"
        destructive
        onConfirm={markLeft}
      >
        <p>
          They will no longer show in salary runs or complaint assignments. Their salary history
          stays saved.
          {owed > 0 && ` ${formatMoney(owed)} of advance is still to be taken back.`}
        </p>
      </ConfirmDialog>
    </>
  )
}

function AdvanceDialog({ s, by, onClose }: { s: Staff; by: string; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  function save() {
    const paise = rupeesToPaise(amount)
    if (paise === null || paise <= 0) return setError('Type the amount in rupees, e.g. 2000.')
    if (paise > s.salary)
      return setError(
        `An advance cannot be more than one month’s salary (${formatMoney(s.salary)}).`,
      )
    updateExtras((x) => {
      x.advances[s.id] = [
        ...(x.advances[s.id] ?? []),
        {
          id: newId('adv'),
          on: TODAY,
          amount: paise,
          note: note.trim() || 'Advance',
          recovered: false,
        },
      ]
    })
    updateDb((d) => {
      d.expenses.unshift({
        id: newId('e'),
        propertyId: s.propertyIds[0] ?? 'p1',
        date: TODAY,
        category: 'salary',
        description: `Salary advance – ${s.name}`,
        vendor: s.name,
        amount: paise,
        mode: 'cash',
        hasBill: false,
      })
      logActivity(d, {
        by,
        kind: 'expense',
        action: `Gave a salary advance of ${formatMoney(paise)}`,
        target: s.name,
      })
    })
    toast.success(`Advance of ${formatMoney(paise)} saved. Take it back in the next salary.`)
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Give an advance to ${s.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save advance</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Amount (₹)" required error={error}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Medical expense"
          />
        </Field>
      </div>
    </Dialog>
  )
}

const DOC_KINDS = [
  'Aadhaar card (masked)',
  'Voter ID',
  'Driving licence',
  'Police verification',
  'Bank passbook',
  'Other',
]

function DocDialog({ s, onClose }: { s: Staff; onClose: () => void }) {
  const [kind, setKind] = useState(DOC_KINDS[0]!)
  function save() {
    updateExtras((x) => {
      x.staffDocs[s.id] = [
        ...(x.staffDocs[s.id] ?? []),
        { id: newId('sd'), title: kind, addedOn: TODAY },
      ]
    })
    if (/Aadhaar|Voter|Driving/.test(kind)) {
      updateDb((d) => {
        const x = d.staff.find((y) => y.id === s.id)
        if (x) x.idProof = true
      })
    }
    toast.success(`${kind} added`)
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a document"
      description="Only the owner and managers can open staff documents."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Add document</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Document">
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)}>
            {DOC_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </NativeSelect>
        </Field>
        <div className="rounded-lg border border-dashed bg-secondary/40 px-4 py-6 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-1 size-5" />
          document-photo.jpg ready to upload
        </div>
      </div>
    </Dialog>
  )
}
