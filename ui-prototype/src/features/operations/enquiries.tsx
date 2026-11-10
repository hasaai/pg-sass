/** Enquiries: people looking for a bed, from first call to booking. */
import {
  CalendarClock,
  CalendarPlus,
  Inbox,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  RotateCcw,
  UserCheck,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import {
  Bars,
  FilterChips,
  Money,
  NoAccess,
  PropertyPicker,
  SearchBox,
  Section,
  Toolbar,
} from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui-kit/menu'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Enquiry } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatDate, rupeesToPaise } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { updateExtras, useExtras } from './extras'
import { KpiRow } from './shared'
import { addDays, ageLabel, daysBetween, phoneDigits } from './helpers'

type EStatus = Enquiry['status']
const ORDER: EStatus[] = ['new', 'contacted', 'visit_booked', 'converted', 'lost']

const STATUS: Record<
  EStatus,
  { label: string; tone: 'bad' | 'info' | 'warn' | 'good' | 'neutral'; dot: string }
> = {
  new: { label: 'New', tone: 'bad', dot: 'bg-red-500' },
  contacted: { label: 'Contacted', tone: 'info', dot: 'bg-blue-500' },
  visit_booked: { label: 'Visit booked', tone: 'warn', dot: 'bg-amber-500' },
  converted: { label: 'Booked', tone: 'good', dot: 'bg-emerald-500' },
  lost: { label: 'Lost', tone: 'neutral', dot: 'bg-slate-400' },
}

const SOURCE: Record<Enquiry['source'], string> = {
  marketplace: 'Online listing',
  website: 'Website',
  phone: 'Phone call',
  walk_in: 'Walk-in',
  referral: 'Referral',
}

const LOST_REASONS = [
  'Found a cheaper place',
  'Too far from office or college',
  'No bed of the type wanted',
  'Did not like the food',
  'Stopped answering',
  'Other',
]

function setStatus(e: Enquiry, status: EStatus, by: string, words: string) {
  updateDb((d) => {
    const x = d.enquiries.find((y) => y.id === e.id)
    if (x) x.status = status
    logActivity(d, { by, kind: 'tenant', action: words, target: e.name, propertyId: e.propertyId })
  })
}

export function EnquiriesPage() {
  useBreadcrumbs([{ label: 'Enquiries' }])
  const { can, person } = useSession()
  const enquiries = useDb((db) => db.enquiries)
  const properties = useDb((db) => db.properties)
  const visits = useExtras((x) => x.enquiryVisits)
  const reasons = useExtras((x) => x.lostReasons)
  const navigate = useNavigate()
  const [view, setView] = useState<'board' | 'list'>('board')
  const [query, setQuery] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [status, setStatusFilter] = useState<'all' | EStatus>('all')
  const [adding, setAdding] = useState(false)
  const [booking, setBooking] = useState<Enquiry | null>(null)
  const [losing, setLosing] = useState<Enquiry | null>(null)

  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    return enquiries
      .filter((e) => !propertyId || e.propertyId === propertyId)
      .filter((e) => !q || `${e.name} ${e.phone} ${e.note}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
  }, [enquiries, propertyId, query])

  if (!can('tenants.manage')) return <NoAccess what="enquiries" />

  const by = person.name
  const propName = (id: string) => properties.find((p) => p.id === id)?.name ?? '—'
  const decided = enquiries.filter((e) => e.status === 'converted' || e.status === 'lost').length
  const converted = enquiries.filter((e) => e.status === 'converted').length
  const sources = (Object.keys(SOURCE) as Enquiry['source'][]).map((s) => ({
    label: SOURCE[s].split(' ')[0]!,
    value: enquiries.filter((e) => e.source === s).length,
    secondary: enquiries.filter((e) => e.source === s && e.status === 'converted').length,
  }))

  function convert(e: Enquiry) {
    setStatus(e, 'converted', by, 'Booked a bed from an enquiry')
    toast.success(`${e.name} marked as booked. Add their tenant details now.`)
    navigate(
      `/app/tenants/new?name=${encodeURIComponent(e.name)}&phone=${encodeURIComponent(e.phone)}&property=${e.propertyId}`,
    )
  }

  function contact(e: Enquiry) {
    if (e.status === 'new') {
      setStatus(e, 'contacted', by, 'Contacted an enquiry')
      toast.success(`${e.name} moved to Contacted`)
    }
  }

  function actions(e: Enquiry, compact?: boolean) {
    const next =
      e.status === 'new'
        ? { label: 'Mark contacted', icon: <UserCheck />, run: () => contact(e) }
        : e.status === 'contacted'
          ? { label: 'Book visit', icon: <CalendarPlus />, run: () => setBooking(e) }
          : e.status === 'visit_booked'
            ? { label: 'Convert', icon: <UserPlus />, run: () => convert(e) }
            : null
    return (
      <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
        <Button asChild variant="ghost" size="icon-sm" aria-label={`Call ${e.name}`}>
          <a href={`tel:+${phoneDigits(e.phone)}`} onClick={() => contact(e)}>
            <Phone />
          </a>
        </Button>
        <Button asChild variant="ghost" size="icon-sm" aria-label={`WhatsApp ${e.name}`}>
          <a
            href={`https://wa.me/${phoneDigits(e.phone)}?text=${encodeURIComponent(`Hi ${e.name.split(' ')[0]}, thank you for asking about ${propName(e.propertyId)}.`)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => contact(e)}
          >
            <MessageCircle />
          </a>
        </Button>
        {next && (
          <Button
            size="sm"
            variant="outline"
            className={cn('ml-auto h-7 px-2 text-xs', compact && 'hidden sm:inline-flex')}
            onClick={next.run}
          >
            {next.icon} {next.label}
          </Button>
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`More for ${e.name}`}
              className={next ? '' : 'ml-auto'}
            >
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {e.status !== 'converted' && (
              <>
                <MenuItem icon={<CalendarPlus />} onSelect={() => setBooking(e)}>
                  {visits[e.id] && e.status === 'visit_booked' ? 'Change visit' : 'Book visit'}
                </MenuItem>
                <MenuItem icon={<UserPlus />} onSelect={() => convert(e)}>
                  Convert to tenant
                </MenuItem>
              </>
            )}
            {(e.status === 'lost' || e.status === 'converted') && (
              <MenuItem
                icon={<RotateCcw />}
                onSelect={() => {
                  setStatus(e, 'contacted', by, 'Reopened an enquiry')
                  toast.success(`${e.name} moved back to Contacted`)
                }}
              >
                Reopen
              </MenuItem>
            )}
            {e.status !== 'lost' && e.status !== 'converted' && (
              <>
                <MenuSeparator />
                <MenuItem destructive icon={<XCircle />} onSelect={() => setLosing(e)}>
                  Mark lost
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
    )
  }

  function meta(e: Enquiry) {
    return (
      <>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="outline">{e.sharing === 1 ? 'Single room' : `${e.sharing} sharing`}</Badge>
          <Badge tone="outline">
            Up to <Money value={e.budget} />
          </Badge>
          <Badge>{SOURCE[e.source]}</Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {propName(e.propertyId)} · moving in {formatDate(e.moveIn)}
        </p>
      </>
    )
  }

  const rows = base.filter((e) => status === 'all' || e.status === status)

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="People who asked about a bed. Follow up quickly – most book within 3 days."
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
              <Plus /> Add enquiry
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <KpiRow>
            <StatCard
              label="New"
              value={enquiries.filter((e) => e.status === 'new').length}
              icon={<Inbox />}
              hint="Not called back yet"
            />
            <StatCard
              label="Visits booked"
              value={enquiries.filter((e) => e.status === 'visit_booked').length}
              icon={<CalendarClock />}
              hint="Coming to see the PG"
            />
            <StatCard label="Booked" value={converted} icon={<UserCheck />} hint="Became tenants" />
            <StatCard
              label="Conversion"
              value={`${decided ? Math.round((converted / decided) * 100) : 0}%`}
              icon={<UserPlus />}
              hint="Booked out of decided"
            />
          </KpiRow>
        </div>
        <Section
          title="Where enquiries come from"
          actions={
            <span className="flex gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-primary" /> All
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-slate-300" /> Booked
              </span>
            </span>
          }
          bodyClassName="pt-3 pb-4"
        >
          <Bars data={sources} height={96} />
        </Section>
      </div>

      <Toolbar>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search name, mobile or note"
          className="max-w-sm"
        />
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
      </Toolbar>

      {view === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="flex min-w-max gap-4 xl:grid xl:min-w-0 xl:grid-cols-5">
            {ORDER.map((s) => {
              const list = base.filter((e) => e.status === s)
              return (
                <section
                  key={s}
                  aria-label={STATUS[s].label}
                  className="flex w-72 shrink-0 flex-col rounded-xl border bg-secondary/40 xl:w-auto"
                >
                  <header className="flex items-center justify-between px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className={cn('size-2 rounded-full', STATUS[s].dot)} />
                      {STATUS[s].label}
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
                    {list.map((e) => (
                      <article key={e.id} className="rounded-lg border bg-card p-3 shadow-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{e.name}</p>
                            <p className="text-xs text-muted-foreground">{e.phone}</p>
                          </div>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {ageLabel(e.createdOn)}
                          </span>
                        </div>
                        {meta(e)}
                        {visits[e.id] && e.status === 'visit_booked' && (
                          <p className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                            <CalendarClock className="size-3.5" /> Visit{' '}
                            {formatDate(visits[e.id]!.date)}, {visits[e.id]!.time}
                          </p>
                        )}
                        {e.status === 'lost' && reasons[e.id] && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Reason: {reasons[e.id]}
                          </p>
                        )}
                        {e.note && <p className="mt-2 line-clamp-2 text-xs italic">“{e.note}”</p>}
                        <div className="mt-2.5 border-t pt-2">{actions(e)}</div>
                      </article>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <FilterChips
              label="Status"
              value={status}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All', count: base.length },
                ...ORDER.map((s) => ({
                  value: s,
                  label: STATUS[s].label,
                  count: base.filter((e) => e.status === s).length,
                })),
              ]}
            />
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="No enquiries match"
              actions={
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <Plus /> Add enquiry
                </Button>
              }
            >
              Try another status or property.
            </EmptyState>
          ) : (
            <div className="rounded-xl border bg-card shadow-xs">
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Looking for</TH>
                    <TH>Property</TH>
                    <TH>Move in</TH>
                    <TH>Source</TH>
                    <TH>Status</TH>
                    <TH className="w-56" />
                  </TR>
                </THead>
                <TBody>
                  {rows.map((e) => (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap">
                        <p className="font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.phone}</p>
                      </TD>
                      <TD className="whitespace-nowrap">
                        {e.sharing === 1 ? 'Single' : `${e.sharing} sharing`}
                        <p className="text-xs text-muted-foreground">
                          up to <Money value={e.budget} />
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap">{propName(e.propertyId)}</TD>
                      <TD className="whitespace-nowrap">{formatDate(e.moveIn)}</TD>
                      <TD>
                        <Badge>{SOURCE[e.source]}</Badge>
                      </TD>
                      <TD>
                        <Badge tone={STATUS[e.status].tone} dot>
                          {STATUS[e.status].label}
                        </Badge>
                      </TD>
                      <TD>{actions(e, true)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </>
      )}

      {adding && <AddEnquiryDialog by={by} onClose={() => setAdding(false)} />}
      {booking && <BookVisitDialog e={booking} by={by} onClose={() => setBooking(null)} />}
      {losing && <LostDialog e={losing} by={by} onClose={() => setLosing(null)} />}
    </>
  )
}

function BookVisitDialog({ e, by, onClose }: { e: Enquiry; by: string; onClose: () => void }) {
  const existing = useExtras((x) => x.enquiryVisits[e.id])
  const [date, setDate] = useState(existing?.date ?? addDays(TODAY, 1))
  const [time, setTime] = useState(existing?.time ?? '18:00')
  const [error, setError] = useState('')
  function save() {
    if (!date || daysBetween(TODAY, date) < 0) return setError('Choose today or a later date.')
    updateExtras((x) => void (x.enquiryVisits[e.id] = { date, time }))
    setStatus(e, 'visit_booked', by, `Booked a visit for ${formatDate(date)}`)
    toast.success(
      `Visit booked for ${formatDate(date)} at ${time}. ${e.name.split(' ')[0]} gets a WhatsApp with the address.`,
    )
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Book a visit for ${e.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Book visit</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" error={error}>
          <Input type="date" value={date} min={TODAY} onChange={(ev) => setDate(ev.target.value)} />
        </Field>
        <Field label="Time">
          <Input type="time" value={time} onChange={(ev) => setTime(ev.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}

function LostDialog({ e, by, onClose }: { e: Enquiry; by: string; onClose: () => void }) {
  const [reason, setReason] = useState(LOST_REASONS[0]!)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Mark ${e.name} as lost?`}
      description="Knowing why helps you fix what is turning people away."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              updateExtras((x) => void (x.lostReasons[e.id] = reason))
              setStatus(e, 'lost', by, 'Marked an enquiry as lost')
              toast.success(`${e.name} marked as lost`)
              onClose()
            }}
          >
            Mark lost
          </Button>
        </>
      }
    >
      <Field label="Why did they not book?">
        <NativeSelect value={reason} onChange={(ev) => setReason(ev.target.value)}>
          {LOST_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </NativeSelect>
      </Field>
    </Dialog>
  )
}

function AddEnquiryDialog({ by, onClose }: { by: string; onClose: () => void }) {
  const properties = useDb((db) => db.properties)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    propertyId: 'p1',
    sharing: '2',
    budget: '',
    moveIn: addDays(TODAY, 7),
    source: 'phone' as Enquiry['source'],
    note: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))
  function save() {
    const e: Record<string, string> = {}
    const budget = rupeesToPaise(form.budget)
    if (form.name.trim().length < 2) e.name = 'Type their name.'
    if (form.phone.replace(/\D/g, '').length !== 10) e.phone = 'Type a 10-digit mobile number.'
    if (budget === null || budget <= 0) e.budget = 'Type their budget per month, e.g. 9000.'
    setErrors(e)
    if (Object.keys(e).length || budget === null) return
    const d = form.phone.replace(/\D/g, '')
    updateDb((db) => {
      db.enquiries.unshift({
        id: newId('q'),
        name: form.name.trim(),
        phone: `${d.slice(0, 5)} ${d.slice(5)}`,
        propertyId: form.propertyId,
        sharing: Number(form.sharing),
        moveIn: form.moveIn,
        budget,
        source: form.source,
        status: 'new',
        note: form.note.trim(),
        createdOn: TODAY,
      })
      logActivity(db, {
        by,
        kind: 'tenant',
        action: 'Added an enquiry',
        target: form.name.trim(),
        propertyId: form.propertyId,
      })
    })
    toast.success(`Enquiry from ${form.name.trim()} added`)
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title="Add enquiry"
      description="Someone called, walked in or messaged about a bed."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Add enquiry</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Mobile" required error={errors.phone}>
            <Input
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="98450 12345"
            />
          </Field>
          <Field label="Property">
            <NativeSelect
              value={form.propertyId}
              onChange={(e) => set('propertyId', e.target.value)}
            >
              {properties
                .filter((p) => p.status !== 'archived')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Room wanted">
            <NativeSelect value={form.sharing} onChange={(e) => set('sharing', e.target.value)}>
              <option value="1">Single room</option>
              <option value="2">2 sharing</option>
              <option value="3">3 sharing</option>
              <option value="4">4 sharing</option>
            </NativeSelect>
          </Field>
          <Field label="Budget per month (₹)" required error={errors.budget}>
            <Input
              inputMode="decimal"
              value={form.budget}
              onChange={(e) => set('budget', e.target.value)}
              placeholder="9000"
            />
          </Field>
          <Field label="Wants to move in on">
            <Input
              type="date"
              value={form.moveIn}
              min={TODAY}
              onChange={(e) => set('moveIn', e.target.value)}
            />
          </Field>
        </div>
        <Field label="How did they find you?">
          <NativeSelect
            value={form.source}
            onChange={(e) => set('source', e.target.value as Enquiry['source'])}
          >
            {(Object.keys(SOURCE) as Enquiry['source'][]).map((s) => (
              <option key={s} value={s}>
                {SOURCE[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Note">
          <Textarea
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="e.g. Joining Infosys on the 15th, wants veg food"
          />
        </Field>
      </div>
    </Dialog>
  )
}
