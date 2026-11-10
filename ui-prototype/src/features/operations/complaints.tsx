/** Complaints: board and list, with a "New complaint" form. */
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  Inbox,
  Plus,
  Timer,
  Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router'

import {
  Avatar,
  FilterChips,
  PropertyPicker,
  SearchBox,
  Status,
  Toolbar,
  NoAccess,
} from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { COMPLAINT_CATEGORY, COMPLAINT_STATUS, PRIORITY, placeLabel } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Complaint, ComplaintStatus, Priority } from '../../data/types'
import { useSession } from '../../demo/session'
import { useBreadcrumbs } from '../../shell/crumbs'
import { cn } from '../../lib/cn'
import { NEXT_STATUS, STATUS_ORDER, setComplaintStatus, staffOptions } from './complaint-actions'
import { updateExtras } from './extras'
import { CategoryIcon, KpiRow, UploadTile } from './shared'
import { ageLabel, daysBetween } from './helpers'

type View = 'board' | 'list'

export function ComplaintsPage() {
  useBreadcrumbs([{ label: 'Complaints' }])
  const { can, person } = useSession()
  const complaints = useDb((db) => db.complaints)
  const properties = useDb((db) => db.properties)
  const tenants = useDb((db) => db.tenants)
  const [view, setView] = useState<View>('board')
  const [query, setQuery] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [status, setStatus] = useState<'all' | ComplaintStatus>('all')
  const [priority, setPriority] = useState<'' | Priority>('')
  const [category, setCategory] = useState<'' | Complaint['category']>('')
  const [adding, setAdding] = useState(false)

  const kpi = useMemo(() => {
    const done = complaints.filter((c) => c.resolvedOn)
    const avg = done.length
      ? done.reduce((s, c) => s + Math.max(0, daysBetween(c.raisedOn, c.resolvedOn!)), 0) /
        done.length
      : 0
    return {
      open: complaints.filter((c) => c.status === 'open').length,
      fixing: complaints.filter((c) => c.status === 'in_progress').length,
      week: complaints.filter((c) => c.resolvedOn && daysBetween(c.resolvedOn, TODAY) <= 7).length,
      avg,
      urgent: complaints.filter(
        (c) => c.priority === 'urgent' && (c.status === 'open' || c.status === 'in_progress'),
      ).length,
    }
  }, [complaints])

  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    return complaints
      .filter((c) => !propertyId || c.propertyId === propertyId)
      .filter((c) => !priority || c.priority === priority)
      .filter((c) => !category || c.category === category)
      .filter((c) => {
        if (!q) return true
        const t = tenants.find((x) => x.id === c.tenantId)
        return [c.number, c.title, c.room ?? '', t?.name ?? '', c.assignedTo ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => b.raisedOn.localeCompare(a.raisedOn))
  }, [complaints, tenants, query, propertyId, priority, category])

  const rows = base.filter((c) => status === 'all' || c.status === status)

  if (!can('complaints.manage')) return <NoAccess what="complaints" />

  const propName = (id: string) => properties.find((p) => p.id === id)?.name ?? '—'

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Everything tenants have asked to be fixed, from new to closed."
        actions={
          <>
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Board' },
                { value: 'list', label: 'List' },
              ]}
            />
            <Button onClick={() => setAdding(true)}>
              <Plus /> New complaint
            </Button>
          </>
        }
      />

      <KpiRow cols={5}>
        <StatCard label="New" value={kpi.open} icon={<Inbox />} hint="Not started yet" />
        <StatCard
          label="Being fixed"
          value={kpi.fixing}
          icon={<Wrench />}
          hint="Someone is on it"
        />
        <StatCard
          label="Fixed this week"
          value={kpi.week}
          icon={<CheckCircle2 />}
          hint="In the last 7 days"
        />
        <StatCard
          label="Average time to fix"
          value={`${kpi.avg.toFixed(1)} days`}
          icon={<Timer />}
          hint="From raised to fixed"
        />
        <StatCard
          label="Urgent"
          value={<span className={kpi.urgent ? 'text-red-600' : ''}>{kpi.urgent}</span>}
          icon={<AlertTriangle />}
          hint="Still open"
        />
      </KpiRow>

      <Toolbar>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search number, problem, tenant, room"
          className="max-w-sm"
        />
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
        {view === 'list' && (
          <>
            <NativeSelect
              aria-label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority | '')}
              className="h-9 w-auto"
            >
              <option value="">Any priority</option>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p].label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Complaint['category'] | '')}
              className="h-9 w-auto"
            >
              <option value="">All categories</option>
              {(Object.keys(COMPLAINT_CATEGORY) as Complaint['category'][]).map((c) => (
                <option key={c} value={c}>
                  {COMPLAINT_CATEGORY[c]}
                </option>
              ))}
            </NativeSelect>
          </>
        )}
      </Toolbar>

      {view === 'board' ? (
        <Board rows={base} by={person.name} propName={propName} />
      ) : (
        <>
          <div className="mb-4">
            <FilterChips
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All', count: base.length },
                ...STATUS_ORDER.map((s) => ({
                  value: s,
                  label: COMPLAINT_STATUS[s].label,
                  count: base.filter((c) => c.status === s).length,
                })),
              ]}
            />
          </div>
          <ComplaintTable rows={rows} propName={propName} onAdd={() => setAdding(true)} />
        </>
      )}

      {adding && <NewComplaintDialog onClose={() => setAdding(false)} />}
    </>
  )
}

function Board({
  rows,
  by,
  propName,
}: {
  rows: Complaint[]
  by: string
  propName: (id: string) => string
}) {
  const tenants = useDb((db) => db.tenants)
  const columnTone: Record<ComplaintStatus, string> = {
    open: 'bg-red-500',
    in_progress: 'bg-amber-500',
    resolved: 'bg-emerald-500',
    closed: 'bg-slate-400',
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="flex min-w-max gap-4 lg:grid lg:min-w-0 lg:grid-cols-4">
        {STATUS_ORDER.map((s) => {
          const list = rows.filter((c) => c.status === s)
          return (
            <section
              key={s}
              aria-label={COMPLAINT_STATUS[s].label}
              className="flex w-72 shrink-0 flex-col rounded-xl border bg-secondary/40 lg:w-auto"
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn('size-2 rounded-full', columnTone[s])} aria-hidden />
                  {COMPLAINT_STATUS[s].label}
                </span>
                <span className="rounded-full bg-card px-2 text-xs text-muted-foreground tabular-nums">
                  {list.length}
                </span>
              </header>
              <div className="grid gap-2.5 px-2.5 pb-2.5">
                {list.length === 0 && (
                  <p className="rounded-lg border border-dashed bg-card/60 px-3 py-6 text-center text-xs text-muted-foreground">
                    Nothing here
                  </p>
                )}
                {list.map((c) => {
                  const t = tenants.find((x) => x.id === c.tenantId)
                  const next = NEXT_STATUS[c.status]
                  return (
                    <article
                      key={c.id}
                      className="rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-md"
                    >
                      <Link to={`/app/complaints/${c.id}`} className="block">
                        <div className="flex items-start gap-2.5">
                          <CategoryIcon category={c.category} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-muted-foreground">{c.number}</p>
                            <p className="text-sm leading-snug font-medium">{c.title}</p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <Status of={PRIORITY} value={c.priority} />
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" aria-hidden /> {ageLabel(c.raisedOn)}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-xs text-muted-foreground">
                          {propName(c.propertyId)}
                          {c.room ? ` · Room ${c.room}` : ''}
                        </p>
                        {t && <p className="truncate text-xs">{t.name}</p>}
                      </Link>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
                        {c.assignedTo ? (
                          <span className="flex min-w-0 items-center gap-1.5 text-xs">
                            <Avatar name={c.assignedTo} size="sm" hue={30} />
                            <span className="truncate">{c.assignedTo}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not assigned</span>
                        )}
                        {next && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setComplaintStatus(c, next.to, by)
                              toast.success(
                                `${c.number} moved to “${COMPLAINT_STATUS[next.to].label}”`,
                              )
                            }}
                          >
                            {next.label} <ArrowRight />
                          </Button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ComplaintTable({
  rows,
  propName,
  onAdd,
}: {
  rows: Complaint[]
  propName: (id: string) => string
  onAdd: () => void
}) {
  const navigate = useNavigate()
  const tenants = useDb((db) => db.tenants)
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Wrench />}
        title="No complaints match"
        actions={
          <Button variant="outline" onClick={onAdd}>
            <Plus /> New complaint
          </Button>
        }
      >
        Try another status, property or search word.
      </EmptyState>
    )
  }
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <Table>
        <THead>
          <TR>
            <TH>Complaint</TH>
            <TH>Where</TH>
            <TH>Tenant</TH>
            <TH>Priority</TH>
            <TH>Status</TH>
            <TH>Assigned to</TH>
            <TH>Raised</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((c) => {
            const t = tenants.find((x) => x.id === c.tenantId)
            return (
              <TR
                key={c.id}
                className="cursor-pointer"
                onClick={() => navigate(`/app/complaints/${c.id}`)}
              >
                <TD>
                  <div className="flex items-center gap-2.5">
                    <CategoryIcon category={c.category} />
                    <div className="min-w-0">
                      <Link
                        to={`/app/complaints/${c.id}`}
                        className="font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.number} · {COMPLAINT_CATEGORY[c.category]}
                      </p>
                    </div>
                  </div>
                </TD>
                <TD className="whitespace-nowrap">
                  {propName(c.propertyId)}
                  <p className="text-xs text-muted-foreground">
                    {c.room ? `Room ${c.room}` : 'Common area'}
                  </p>
                </TD>
                <TD className="whitespace-nowrap">{t?.name ?? '—'}</TD>
                <TD>
                  <Status of={PRIORITY} value={c.priority} />
                </TD>
                <TD>
                  <Status of={COMPLAINT_STATUS} value={c.status} />
                </TD>
                <TD className="whitespace-nowrap">
                  {c.assignedTo ?? <span className="text-muted-foreground">Not assigned</span>}
                </TD>
                <TD className="whitespace-nowrap text-muted-foreground">{ageLabel(c.raisedOn)}</TD>
              </TR>
            )
          })}
        </TBody>
      </Table>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        Showing {rows.length} complaint{rows.length === 1 ? '' : 's'}
      </p>
    </div>
  )
}

function NewComplaintDialog({ onClose }: { onClose: () => void }) {
  const { person } = useSession()
  const navigate = useNavigate()
  const db = useDb((d) => d)
  const firstProperty = db.properties.find((p) => p.status === 'active')?.id ?? ''
  const [form, setForm] = useState({
    propertyId: firstProperty,
    room: '',
    tenantId: '',
    category: 'electrical' as Complaint['category'],
    title: '',
    description: '',
    priority: 'medium' as Priority,
    assignedTo: '',
    photo: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const rooms = db.rooms
    .filter((r) => r.propertyId === form.propertyId)
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
  const roomTenants = db.tenants.filter((t) => {
    if (t.propertyId !== form.propertyId) return false
    if (t.status !== 'active' && t.status !== 'notice') return false
    if (!form.room) return true
    const bed = db.beds.find((b) => b.id === t.bedId)
    return db.rooms.find((r) => r.id === bed?.roomId)?.number === form.room
  })

  function save() {
    const e: Record<string, string> = {}
    if (!form.propertyId) e.propertyId = 'Choose the property.'
    if (form.title.trim().length < 4) e.title = 'Write what the problem is, e.g. “Fan not working”.'
    setErrors(e)
    if (Object.keys(e).length) return
    const id = newId('c')
    const number = `CMP-${1040 + db.complaints.length}`
    updateDb((d) => {
      const updates = [{ on: TODAY, by: person.name, text: 'Complaint added by the office.' }]
      if (form.assignedTo)
        updates.push({ on: TODAY, by: person.name, text: `Assigned to ${form.assignedTo}.` })
      d.complaints.unshift({
        id,
        number,
        propertyId: form.propertyId,
        tenantId: form.tenantId || undefined,
        room: form.room || undefined,
        category: form.category,
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        status: form.assignedTo ? 'in_progress' : 'open',
        assignedTo: form.assignedTo || undefined,
        raisedOn: TODAY,
        updates,
      })
      logActivity(d, {
        by: person.name,
        kind: 'complaint',
        action: `Added complaint ${number}`,
        target: form.title.trim(),
        propertyId: form.propertyId,
      })
    })
    if (form.photo)
      updateExtras((x) => void (x.complaintPhotos[id] = [Math.floor(Math.random() * 360)]))
    toast.success(`Complaint ${number} added`, {
      action: { label: 'Open', onClick: () => navigate(`/app/complaints/${id}`) },
    })
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title="New complaint"
      description="Add a problem a tenant told you about, or one you found yourself."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Add complaint</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property" required error={errors.propertyId}>
            <NativeSelect
              value={form.propertyId}
              onChange={(e) =>
                setForm((f) => ({ ...f, propertyId: e.target.value, room: '', tenantId: '' }))
              }
            >
              <option value="">Choose…</option>
              {db.properties
                .filter((p) => p.status !== 'archived')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Room" hint="Leave empty for common areas">
            <NativeSelect
              value={form.room}
              onChange={(e) => setForm((f) => ({ ...f, room: e.target.value, tenantId: '' }))}
            >
              <option value="">Common area</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.number}>
                  Room {r.number}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Tenant (optional)">
          <NativeSelect value={form.tenantId} onChange={(e) => set('tenantId', e.target.value)}>
            <option value="">No tenant / raised by staff</option>
            {roomTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {placeLabel(db, t)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Category">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(COMPLAINT_CATEGORY) as Complaint['category'][]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={form.category === c}
                onClick={() => set('category', c)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-colors',
                  form.category === c
                    ? 'border-primary bg-accent font-medium ring-1 ring-primary'
                    : 'bg-card hover:bg-secondary',
                )}
              >
                <CategoryIcon category={c} className="size-7 bg-transparent" />
                {COMPLAINT_CATEGORY[c]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="What is the problem?" required error={errors.title}>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Geyser not heating"
          />
        </Field>
        <Field label="Details">
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="When did it start? Anything the person fixing it should know?"
          />
        </Field>
        <Field label="Priority">
          <Segmented
            label="Priority"
            value={form.priority}
            onChange={(v) => set('priority', v)}
            options={(Object.keys(PRIORITY) as Priority[]).map((p) => ({
              value: p,
              label: PRIORITY[p].label,
            }))}
          />
        </Field>
        <Field label="Photo">
          <UploadTile
            icon={<Camera />}
            label="Add a photo of the problem"
            doneLabel="photo-of-problem.jpg added"
            done={form.photo}
            onClick={() => set('photo', !form.photo)}
          />
        </Field>
        <Field label="Assign to" hint="The person gets a WhatsApp message with the details.">
          <NativeSelect value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
            <option value="">Assign later</option>
            {staffOptions(db, form.propertyId).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {form.priority === 'urgent' && (
          <Badge tone="bad" className="w-fit">
            Urgent complaints are shown at the top of the dashboard
          </Badge>
        )}
      </div>
    </Dialog>
  )
}
