/** One complaint: status, details, photos, people, updates. */
import {
  ArrowLeft,
  Camera,
  Check,
  IndianRupee,
  MessageCircle,
  Phone,
  RotateCcw,
  Send,
  UserPlus,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import {
  Avatar,
  DetailList,
  Money,
  NoAccess,
  PhotoTile,
  Section,
  Status,
} from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { CheckboxRow } from '../../components/ui-kit/checkbox'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { COMPLAINT_CATEGORY, COMPLAINT_STATUS, PRIORITY } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Complaint, Priority } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney, rupeesToPaise } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import {
  NEXT_STATUS,
  STATUS_ORDER,
  changeComplaint,
  setComplaintStatus,
  staffOptions,
} from './complaint-actions'
import { updateExtras, useExtras } from './extras'
import { CategoryIcon, WhatsAppPreview } from './shared'
import { ageLabel, daysBetween, phoneDigits } from './helpers'

export function ComplaintDetailPage() {
  const { id = '' } = useParams()
  const complaint = useDb((db) => db.complaints.find((c) => c.id === id))
  useBreadcrumbs([
    { label: 'Complaints', to: '/app/complaints' },
    { label: complaint?.number ?? 'Not found' },
  ])
  const { can } = useSession()
  if (!can('complaints.manage')) return <NoAccess what="complaints" />
  if (!complaint) {
    return (
      <EmptyState
        icon={<Wrench />}
        title="This complaint was not found"
        actions={
          <Button asChild variant="outline">
            <Link to="/app/complaints">Back to complaints</Link>
          </Button>
        }
      >
        It may have been removed. Go back to the list to find it.
      </EmptyState>
    )
  }
  return <Detail c={complaint} />
}

function Stepper({ status }: { status: Complaint['status'] }) {
  const at = STATUS_ORDER.indexOf(status)
  return (
    <ol className="mb-6 grid grid-cols-4 gap-2 rounded-xl border bg-card p-3 shadow-xs sm:p-4">
      {STATUS_ORDER.map((s, i) => {
        const done = i < at
        const current = i === at
        return (
          <li
            key={s}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:text-left"
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-emerald-500 bg-emerald-500 text-white',
                current && 'border-primary bg-primary text-primary-foreground',
                !done && !current && 'bg-card text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                'truncate text-xs sm:text-sm',
                current ? 'font-semibold' : 'text-muted-foreground',
              )}
            >
              {COMPLAINT_STATUS[s].label}
            </span>
            {i < STATUS_ORDER.length - 1 && (
              <span
                className={cn('hidden h-px flex-1 sm:block', done ? 'bg-emerald-500' : 'bg-border')}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Detail({ c }: { c: Complaint }) {
  const { person, can } = useSession()
  const db = useDb((d) => d)
  const photos = useExtras((x) => x.complaintPhotos[c.id])
  const property = db.properties.find((p) => p.id === c.propertyId)
  const tenant = db.tenants.find((t) => t.id === c.tenantId)
  const seesMoney = can('expenses.view')
  const [note, setNote] = useState('')
  const [assignee, setAssignee] = useState(c.assignedTo ?? '')
  const [cost, setCost] = useState(c.cost ? String(c.cost / 100) : '')
  const [asExpense, setAsExpense] = useState(true)
  const [costError, setCostError] = useState('')
  const [telling, setTelling] = useState(false)
  const next = NEXT_STATUS[c.status]
  const by = person.name

  function move(to: Complaint['status']) {
    setComplaintStatus(c, to, by)
    toast.success(`${c.number} is now “${COMPLAINT_STATUS[to].label}”`)
  }

  function addUpdate() {
    if (!note.trim()) return
    changeComplaint(c.id, by, () => {}, { text: note.trim() })
    setNote('')
    toast.success('Update added')
  }

  function assign() {
    if (!assignee || assignee === c.assignedTo) return
    const again = Boolean(c.assignedTo)
    changeComplaint(
      c.id,
      by,
      (x) => {
        x.assignedTo = assignee
        if (x.status === 'open') x.status = 'in_progress'
      },
      {
        text: again
          ? `Reassigned from ${c.assignedTo} to ${assignee}.`
          : `Assigned to ${assignee}.`,
        activity: `${again ? 'Reassigned' : 'Assigned'} complaint ${c.number} to ${assignee}`,
      },
    )
    toast.success(`${assignee} will get the details on WhatsApp`)
  }

  function setPriority(p: Priority) {
    changeComplaint(c.id, by, (x) => void (x.priority = p), {
      text: `Priority changed to ${PRIORITY[p].label}.`,
    })
    toast.success(`Priority set to ${PRIORITY[p].label}`)
  }

  function recordCost() {
    const paise = rupeesToPaise(cost)
    if (paise === null || paise <= 0) {
      setCostError('Type the amount spent in rupees, e.g. 450.')
      return
    }
    setCostError('')
    const addExpense = asExpense && can('expenses.manage')
    updateDb((d) => {
      const x = d.complaints.find((y) => y.id === c.id)
      if (!x) return
      x.cost = paise
      x.updates = [...x.updates, { on: TODAY, by, text: `Cost of ${formatMoney(paise)} recorded.` }]
      if (addExpense) {
        d.expenses.unshift({
          id: newId('e'),
          propertyId: c.propertyId,
          date: TODAY,
          category: 'maintenance',
          description: `${c.title} (${c.number})`,
          vendor: c.assignedTo ?? 'Local repair',
          amount: paise,
          mode: 'cash',
          hasBill: false,
        })
        logActivity(d, {
          by,
          kind: 'expense',
          action: `Added an expense of ${formatMoney(paise)}`,
          target: c.title,
          propertyId: c.propertyId,
        })
      }
    })
    toast.success(addExpense ? 'Cost saved and added to expenses' : 'Cost saved')
  }

  function addPhoto() {
    updateExtras((x) => {
      x.complaintPhotos[c.id] = [
        ...(x.complaintPhotos[c.id] ?? []),
        (photos?.length ?? 0) * 70 + 40,
      ]
    })
    toast.success('Photo added')
  }

  const fixDays = c.resolvedOn ? daysBetween(c.raisedOn, c.resolvedOn) : null

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            to="/app/complaints"
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Complaints
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <CategoryIcon category={c.category} className="size-10" />
            <span className="min-w-0">{c.title}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {c.number} · raised {ageLabel(c.raisedOn).toLowerCase()}
            <Status of={COMPLAINT_STATUS} value={c.status} />
            <Status of={PRIORITY} value={c.priority} />
          </span>
        }
        actions={
          <>
            {tenant && (
              <Button variant="outline" onClick={() => setTelling(true)}>
                <MessageCircle /> Tell the tenant
              </Button>
            )}
            {(c.status === 'resolved' || c.status === 'closed') && (
              <Button variant="outline" onClick={() => move('open')}>
                <RotateCcw /> Reopen
              </Button>
            )}
            {next && (
              <Button onClick={() => move(next.to)}>
                <Check /> {next.label}
              </Button>
            )}
          </>
        }
      />

      <Stepper status={c.status} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Section title="Details">
            <DetailList
              items={[
                ['Category', COMPLAINT_CATEGORY[c.category]],
                ['Property', property?.name ?? '—'],
                ['Room', c.room ? `Room ${c.room}` : 'Common area'],
                ['Raised on', formatDate(c.raisedOn)],
                [
                  'Fixed on',
                  c.resolvedOn ? `${formatDate(c.resolvedOn)} (${fixDays} days)` : 'Not yet',
                ],
                ...(seesMoney
                  ? ([['Cost', c.cost !== undefined ? formatMoney(c.cost) : 'Not recorded']] as [
                      string,
                      string,
                    ][])
                  : []),
              ]}
            />
            <div className="mt-5 rounded-lg bg-secondary/50 p-4 text-sm leading-relaxed">
              {c.description || 'No details were given.'}
            </div>
          </Section>

          <Section
            title="Photos"
            description={
              photos?.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : undefined
            }
            actions={
              <Button size="sm" variant="outline" onClick={addPhoto}>
                <Camera /> Add photo
              </Button>
            }
          >
            {photos?.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((h, i) => (
                  <PhotoTile key={i} hue={h} caption={i === 0 ? 'From tenant' : `Photo ${i + 1}`} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No photos yet. A photo helps the person fixing it bring the right parts.
              </p>
            )}
          </Section>

          <Section title="Updates" description="Everything that happened, newest at the bottom.">
            <ol className="relative grid gap-5 border-l pl-5">
              {c.updates.map((u, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-1 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary ring-1 ring-primary/30" />
                  <p className="text-sm">{u.text}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {u.by} · {formatDate(u.on)}
                  </p>
                </li>
              ))}
            </ol>
            <div className="mt-5 grid gap-2 border-t pt-4">
              <Field label="Add an update">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Plumber coming tomorrow at 11 am"
                  className="min-h-16"
                />
              </Field>
              <div className="flex justify-end">
                <Button size="sm" onClick={addUpdate} disabled={!note.trim()}>
                  Add update
                </Button>
              </div>
            </div>
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="Tenant">
            {tenant ? (
              <div className="grid gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={tenant.name} hue={tenant.photoHue} size="lg" />
                  <div className="min-w-0">
                    <Link to={`/app/tenants/${tenant.id}`} className="font-medium hover:underline">
                      {tenant.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">{tenant.phone}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:+${phoneDigits(tenant.phone)}`}>
                      <Phone /> Call
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTelling(true)}>
                    <MessageCircle /> WhatsApp
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No tenant linked. This was raised by staff or for a common area.
              </p>
            )}
          </Section>

          <Section title="Who is fixing it">
            <div className="grid gap-3">
              {c.assignedTo && (
                <div className="flex items-center gap-2.5 rounded-lg bg-secondary/50 p-2.5">
                  <Avatar name={c.assignedTo} hue={30} />
                  <div className="text-sm">
                    <p className="font-medium">{c.assignedTo}</p>
                    <p className="text-xs text-muted-foreground">Assigned</p>
                  </div>
                </div>
              )}
              <Field label={c.assignedTo ? 'Reassign to' : 'Assign to'}>
                <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Choose staff…</option>
                  {staffOptions(db, c.propertyId).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Button
                variant="outline"
                onClick={assign}
                disabled={!assignee || assignee === c.assignedTo}
              >
                <UserPlus /> {c.assignedTo ? 'Reassign' : 'Assign'}
              </Button>
            </div>
          </Section>

          <Section title="Priority">
            <Segmented
              label="Priority"
              value={c.priority}
              onChange={setPriority}
              options={(Object.keys(PRIORITY) as Priority[]).map((p) => ({
                value: p,
                label: PRIORITY[p].label,
              }))}
            />
          </Section>

          {seesMoney && (
            <Section title="Cost of the repair">
              <div className="grid gap-3">
                {c.cost !== undefined && (
                  <p className="text-sm">
                    Recorded: <Money value={c.cost} className="font-semibold" />
                  </p>
                )}
                <Field label="Amount spent (₹)" error={costError}>
                  <Input
                    inputMode="decimal"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="e.g. 450"
                  />
                </Field>
                {can('expenses.manage') && (
                  <CheckboxRow
                    label="Also add to expenses"
                    hint="Saved under Repairs for this property"
                    checked={asExpense}
                    onCheckedChange={(v) => setAsExpense(v === true)}
                  />
                )}
                <Button variant="outline" onClick={recordCost}>
                  <IndianRupee /> Record cost
                </Button>
              </div>
            </Section>
          )}
        </div>
      </div>

      {telling && tenant && (
        <TellTenantDialog
          c={c}
          name={tenant.name}
          phone={tenant.phone}
          by={by}
          onClose={() => setTelling(false)}
        />
      )}
    </>
  )
}

function TellTenantDialog({
  c,
  name,
  phone,
  by,
  onClose,
}: {
  c: Complaint
  name: string
  phone: string
  by: string
  onClose: () => void
}) {
  const first = name.split(' ')[0]
  const defaults: Record<Complaint['status'], string> = {
    open: `Hi ${first}, we got your complaint “${c.title}” (${c.number}). We will send someone soon.`,
    in_progress: `Hi ${first}, ${c.assignedTo ?? 'our team'} is working on “${c.title}” (${c.number}). We will update you once it is fixed.`,
    resolved: `Hi ${first}, “${c.title}” (${c.number}) has been fixed. Please let us know if there is still a problem.`,
    closed: `Hi ${first}, we have closed your complaint “${c.title}” (${c.number}). Thank you for your patience.`,
  }
  const [text, setText] = useState(defaults[c.status])
  function send() {
    changeComplaint(c.id, by, () => {}, { text: `Told ${name} on WhatsApp: “${text}”` })
    toast.success(`WhatsApp message sent to ${name}`)
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Tell the tenant"
      description={`WhatsApp to ${name} · ${phone}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!text.trim()}>
            <Send /> Send on WhatsApp
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Message">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-24" />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Preview</p>
          <WhatsAppPreview to={name} text={text} />
        </div>
      </div>
    </Dialog>
  )
}
