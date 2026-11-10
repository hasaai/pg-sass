/** Home of the business app: what needs attention today and how the business is doing. */
import {
  ArrowRight,
  BedDouble,
  CalendarClock,
  ClipboardList,
  DoorOpen,
  IndianRupee,
  LogIn,
  Megaphone,
  MessageCircle,
  Phone,
  Plus,
  Receipt,
  TriangleAlert,
  Wallet,
  Wrench,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

import { Avatar, Bars, FilterChips, PropertyPicker, Section, Status } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Alert, EmptyState, Meter } from '../../components/ui-kit/feedback'
import { toast } from '../../components/ui-kit/toast'
import { PRIORITY, balance, daysLate, occupancy, placeLabel } from '../../data/selectors'
import { THIS_MONTH, TODAY } from '../../data/seed'
import { useDb } from '../../data/store'
import { useSession } from '../../demo/session'
import { useBreadcrumbs } from '../../shell/crumbs'
import { cn } from '../../lib/cn'
import {
  formatDate,
  formatMoney,
  formatMonth,
  parseDate,
  plural,
  shiftPeriod,
} from '../../lib/format'
import { KindIcon, RecordPaymentDialog } from './parts'
import { ago, daysFromToday, dismissedStore, phoneDigits, shortMoney } from './util'

function greeting() {
  return 'Good evening'
}

function Kpi({
  label,
  value,
  hint,
  icon,
  to,
  tone,
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  to: string
  tone?: 'bad' | 'warn'
  children?: ReactNode
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-md bg-secondary text-muted-foreground [&_svg]:size-4',
            tone === 'bad' && 'bg-red-50 text-red-600',
            tone === 'warn' && 'bg-amber-50 text-amber-600',
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </Link>
  )
}

type TaskFilter = 'all' | 'rent' | 'checkin' | 'notice' | 'complaint'

interface Task {
  id: string
  kind: Exclude<TaskFilter, 'all'>
  title: string
  detail: string
  badge: ReactNode
  actions: ReactNode
  avatar?: { name: string; hue: number }
  sort: number
}

export function DashboardPage() {
  useBreadcrumbs([{ label: 'Dashboard' }])
  const navigate = useNavigate()
  const { can, person, role } = useSession()
  const seeMoney = can('rent.view')

  const db = useDb((d) => d)
  const business = useDb((d) => d.business)
  const dismissed = dismissedStore.use()
  const [propertyId, setPropertyId] = useState('')
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [payFor, setPayFor] = useState<string | null>(null)

  const inProp = <T extends { propertyId?: string }>(x: T) =>
    !propertyId || x.propertyId === propertyId

  const stats = useMemo(() => {
    const occ = occupancy(db, propertyId || undefined)
    const month = db.invoices.filter((i) => i.period === THIS_MONTH && inPropFn(i, propertyId))
    const expected = month.reduce((s, i) => s + i.total, 0)
    const collected = month.reduce((s, i) => s + i.paid, 0)
    const overdue = db.invoices.filter((i) => i.status === 'overdue' && inPropFn(i, propertyId))
    const overdueAmount = overdue.reduce((s, i) => s + balance(i), 0)
    const openComplaints = db.complaints.filter(
      (c) => (c.status === 'open' || c.status === 'in_progress') && inPropFn(c, propertyId),
    )
    const urgent = openComplaints.filter(
      (c) => c.priority === 'urgent' || c.priority === 'high',
    ).length
    const movingOut = db.tenants.filter(
      (t) =>
        t.status === 'notice' &&
        t.moveOutOn &&
        t.moveOutOn.slice(0, 7) <= THIS_MONTH &&
        inPropFn(t, propertyId),
    )
    return { occ, expected, collected, overdue, overdueAmount, openComplaints, urgent, movingOut }
  }, [db, propertyId])

  const chart = useMemo(() => {
    return [-3, -2, -1, 0].map((n) => {
      const period = shiftPeriod(THIS_MONTH, n)
      const list = db.invoices.filter((i) => i.period === period && inPropFn(i, propertyId))
      return {
        label: formatMonth(period).slice(0, 3),
        value: list.reduce((s, i) => s + i.paid, 0),
        secondary: list.reduce((s, i) => s + i.total, 0),
      }
    })
  }, [db, propertyId])

  const tasks = (() => {
    const list: Task[] = []
    const tenantOf = (id?: string) => db.tenants.find((t) => t.id === id)
    if (seeMoney) {
      for (const inv of db.invoices.filter(
        (i) => i.status === 'overdue' && inPropFn(i, propertyId),
      )) {
        const t = tenantOf(inv.tenantId)
        if (!t) continue
        const late = daysLate(inv)
        list.push({
          id: `rent-${inv.id}`,
          kind: 'rent',
          title: t.name,
          detail: `${placeLabel(db, t)} · ${formatMonth(inv.period)} · ${plural(late, 'day')} late`,
          badge: <Badge tone="bad">{formatMoney(balance(inv))} due</Badge>,
          avatar: { name: t.name, hue: t.photoHue },
          sort: -late,
          actions: (
            <>
              <Button variant="outline" size="icon-sm" asChild>
                <a href={`tel:+${phoneDigits(t.phone)}`} aria-label={`Call ${t.name}`}>
                  <Phone />
                </a>
              </Button>
              <Button variant="outline" size="icon-sm" asChild>
                <a
                  href={`https://wa.me/${phoneDigits(t.phone)}?text=${encodeURIComponent(`Hi ${t.name.split(' ')[0]}, your rent of ${formatMoney(balance(inv))} for ${formatMonth(inv.period)} is overdue. Please pay by UPI to ${db.settings.upiId}. Thank you!`)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`WhatsApp ${t.name}`}
                  onClick={() => toast.success(`WhatsApp reminder opened for ${t.name}`)}
                >
                  <MessageCircle />
                </a>
              </Button>
              {can('rent.collect') && (
                <Button size="sm" onClick={() => setPayFor(inv.id)}>
                  Record payment
                </Button>
              )}
            </>
          ),
        })
      }
    }
    for (const t of db.tenants.filter((x) => x.status === 'upcoming' && inPropFn(x, propertyId))) {
      const d = daysFromToday(t.checkIn)
      if (d > 7) continue
      list.push({
        id: `in-${t.id}`,
        kind: 'checkin',
        title: `${t.name} moves in`,
        detail: `${placeLabel(db, t)} · ${formatDate(t.checkIn)}${t.kyc !== 'verified' ? ' · ID proof pending' : ''}`,
        badge: (
          <Badge tone="info">{d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`}</Badge>
        ),
        avatar: { name: t.name, hue: t.photoHue },
        sort: 100 + d,
        actions: (
          <Button size="sm" variant="outline" onClick={() => navigate(`/app/tenants/${t.id}`)}>
            Prepare check-in
          </Button>
        ),
      })
    }
    for (const t of db.tenants.filter(
      (x) => x.status === 'notice' && x.moveOutOn && inPropFn(x, propertyId),
    )) {
      const d = daysFromToday(t.moveOutOn!)
      if (d > 30) continue
      list.push({
        id: `out-${t.id}`,
        kind: 'notice',
        title: `${t.name} is moving out`,
        detail: `${placeLabel(db, t)} · last day ${formatDate(t.moveOutOn)}`,
        badge: <Badge tone="warn">{d <= 0 ? 'Today' : `In ${d} days`}</Badge>,
        avatar: { name: t.name, hue: t.photoHue },
        sort: 200 + d,
        actions: (
          <Button size="sm" variant="outline" onClick={() => navigate(`/app/tenants/${t.id}`)}>
            Plan check-out
          </Button>
        ),
      })
    }
    for (const c of db.complaints.filter((x) => x.status === 'open' && inPropFn(x, propertyId))) {
      list.push({
        id: `c-${c.id}`,
        kind: 'complaint',
        title: c.title,
        detail: `${c.number}${c.room ? ` · Room ${c.room}` : ''} · ${db.properties.find((p) => p.id === c.propertyId)?.name ?? ''} · ${c.raisedOn === TODAY ? 'today' : formatDate(c.raisedOn)}`,
        badge: <Status of={PRIORITY} value={c.priority} />,
        sort: 50 + ['urgent', 'high', 'medium', 'low'].indexOf(c.priority),
        actions: (
          <Button size="sm" variant="outline" onClick={() => navigate(`/app/complaints/${c.id}`)}>
            Assign
          </Button>
        ),
      })
    }
    return list.sort((a, b) => a.sort - b.sort)
  })()

  const counts = {
    rent: tasks.filter((t) => t.kind === 'rent').length,
    checkin: tasks.filter((t) => t.kind === 'checkin').length,
    notice: tasks.filter((t) => t.kind === 'notice').length,
    complaint: tasks.filter((t) => t.kind === 'complaint').length,
  }
  const shown = tasks.filter((t) => filter === 'all' || t.kind === filter)
  const [showAll, setShowAll] = useState(false)
  const visibleTasks = showAll ? shown : shown.slice(0, 6)

  const properties = db.properties.filter(
    (p) => p.status !== 'archived' && inProp({ propertyId: p.id }),
  )
  const activity = db.activity.filter((a) => inProp(a)).slice(0, 7)

  const dateLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseDate(TODAY))
  const firstName = person.name.split(' ')[0]
  const collectedPct = stats.expected ? Math.round((stats.collected / stats.expected) * 100) : 0

  const reminders: { id: string; node: ReactNode }[] = []
  if (role === 'owner' && !business.emailConfirmed && !dismissed.includes('email'))
    reminders.push({
      id: 'email',
      node: (
        <Alert tone="info" title="Please confirm your email" actions={<DismissButton id="email" />}>
          We sent a link to <b>{business.email}</b>. Nothing waits for it – it only makes sure
          receipts and plan bills reach you.
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="bg-white"
              onClick={() => toast.success(`Link sent again to ${business.email}`)}
            >
              Send the link again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/confirm-email')}>
              Open the link (demo)
            </Button>
          </div>
        </Alert>
      ),
    })
  if (role === 'owner' && business.verification !== 'approved' && !dismissed.includes('verify'))
    reminders.push({
      id: 'verify',
      node: (
        <Alert
          tone="warn"
          title={
            business.verification === 'submitted' || business.verification === 'under_review'
              ? 'Your identity check is with our team'
              : 'Verify your identity to publish listings online'
          }
          actions={<DismissButton id="verify" />}
        >
          {business.verification === 'submitted' || business.verification === 'under_review'
            ? 'We usually finish within 1 working day. Everything else in the app works as normal.'
            : 'Takes 3 minutes with your PAN or another ID. Only needed for online listings – the rest of the app works without it.'}
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline"
              className="bg-white"
              onClick={() => navigate('/app/verify-identity')}
            >
              {business.verification === 'submitted' || business.verification === 'under_review'
                ? 'See status'
                : 'Verify now'}
            </Button>
          </div>
        </Alert>
      ),
    })

  return (
    <div className="grid gap-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{dateLabel}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasks.length
              ? `${plural(tasks.length, 'thing')} need your attention today.`
              : 'Nothing needs your attention today.'}
          </p>
        </div>
        <PropertyPicker value={propertyId} onChange={setPropertyId} className="w-full sm:w-auto" />
      </div>

      {reminders.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {reminders.map((r) => (
            <div key={r.id}>{r.node}</div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {can('tenants.manage') && (
          <Button variant="outline" onClick={() => navigate('/app/tenants/new')}>
            <Plus /> Add tenant
          </Button>
        )}
        {can('rent.collect') && (
          <Button variant="outline" onClick={() => navigate('/app/rent')}>
            <Receipt /> Record payment
          </Button>
        )}
        {can('expenses.manage') && (
          <Button variant="outline" onClick={() => navigate('/app/expenses')}>
            <Wallet /> Add expense
          </Button>
        )}
        {can('notices.manage') && (
          <Button variant="outline" onClick={() => navigate('/app/notices')}>
            <Megaphone /> Post notice
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className={cn('grid grid-cols-2 gap-3', seeMoney ? 'xl:grid-cols-5' : 'xl:grid-cols-3')}>
        <Kpi
          label="Beds filled"
          value={
            <>
              {stats.occ.filled}
              <span className="text-base font-normal text-muted-foreground">/{stats.occ.beds}</span>
            </>
          }
          icon={<BedDouble />}
          to="/app/properties"
          hint={`${stats.occ.pct}% full · ${plural(stats.occ.vacant, 'bed')} vacant`}
        >
          <div className="mt-2">
            <Meter value={stats.occ.filled} max={stats.occ.beds} label="Beds filled" />
          </div>
        </Kpi>
        {seeMoney && (
          <Kpi
            label={`Rent collected · ${formatMonth(THIS_MONTH).split(' ')[0]}`}
            value={formatMoney(stats.collected)}
            icon={<IndianRupee />}
            to="/app/rent"
            hint={`${collectedPct}% of ${formatMoney(stats.expected)} expected`}
          >
            <div className="mt-2">
              <Meter value={stats.collected} max={stats.expected} label="Rent collected" />
            </div>
          </Kpi>
        )}
        {seeMoney && (
          <Kpi
            label="Overdue rent"
            value={formatMoney(stats.overdueAmount)}
            icon={<TriangleAlert />}
            tone={stats.overdue.length ? 'bad' : undefined}
            to="/app/rent"
            hint={
              stats.overdue.length
                ? `${plural(stats.overdue.length, 'tenant')} late`
                : 'Everyone is on time'
            }
          />
        )}
        <Kpi
          label="Open complaints"
          value={stats.openComplaints.length}
          icon={<Wrench />}
          tone={stats.urgent ? 'warn' : undefined}
          to="/app/complaints"
          hint={stats.urgent ? `${stats.urgent} high or urgent` : 'None urgent'}
        />
        <Kpi
          label="Moving out this month"
          value={stats.movingOut.length}
          icon={<DoorOpen />}
          to="/app/tenants"
          hint={stats.movingOut.length ? 'Beds to fill soon' : 'No one leaving'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* Today */}
        <Section
          title="Today"
          description="Rent to follow up, check-ins, people leaving and new complaints."
          bodyClassName="p-0"
        >
          <div className="border-b px-5 py-3">
            <FilterChips
              label="Show"
              value={filter}
              onChange={(v) => {
                setFilter(v)
                setShowAll(false)
              }}
              options={[
                { value: 'all', label: 'All', count: tasks.length },
                ...(seeMoney
                  ? [{ value: 'rent' as const, label: 'Rent overdue', count: counts.rent }]
                  : []),
                { value: 'checkin', label: 'Check-ins', count: counts.checkin },
                { value: 'notice', label: 'Notices ending', count: counts.notice },
                { value: 'complaint', label: 'New complaints', count: counts.complaint },
              ]}
            />
          </div>
          {visibleTasks.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={<ClipboardList />} title="All clear">
                Nothing in this list right now. Enjoy your chai.
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y">
              {visibleTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {t.avatar ? (
                      <Avatar name={t.avatar.name} hue={t.avatar.hue} />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                        {t.kind === 'complaint' ? (
                          <Wrench className="size-4" />
                        ) : t.kind === 'checkin' ? (
                          <LogIn className="size-4" />
                        ) : (
                          <CalendarClock className="size-4" />
                        )}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        {t.badge}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                        {t.detail}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">{t.actions}</div>
                </li>
              ))}
            </ul>
          )}
          {shown.length > 6 && (
            <div className="border-t px-5 py-2.5 text-center">
              <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show less' : `Show all ${shown.length}`}
              </Button>
            </div>
          )}
        </Section>

        <div className="grid content-start gap-6">
          {seeMoney && (
            <Section
              title="Rent collection"
              description="Collected vs expected, last 4 months"
              actions={
                <Button variant="ghost" size="sm" onClick={() => navigate('/app/rent')}>
                  Details <ArrowRight />
                </Button>
              }
            >
              <Bars data={chart} format={shortMoney} height={150} />
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary" /> Collected
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-slate-300" /> Expected
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                {chart.slice(-2).map((c) => (
                  <div key={c.label}>
                    <dt className="text-xs text-muted-foreground">{c.label}</dt>
                    <dd className="font-semibold tabular-nums">
                      {shortMoney(c.value)}{' '}
                      <span className="font-normal text-muted-foreground">
                        of {shortMoney(c.secondary)}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <Section
            title="Recent activity"
            actions={
              role === 'owner' ? (
                <Button variant="ghost" size="sm" onClick={() => navigate('/app/activity')}>
                  See all <ArrowRight />
                </Button>
              ) : undefined
            }
            bodyClassName="p-0"
          >
            {activity.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="divide-y">
                {activity
                  .filter((a) => seeMoney || (a.kind !== 'rent' && a.kind !== 'expense'))
                  .map((a) => (
                    <li key={a.id} className="flex gap-3 px-5 py-3">
                      <KindIcon kind={a.kind} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-snug">
                          <span className="font-medium">{a.by}</span>{' '}
                          {a.action.charAt(0).toLowerCase() + a.action.slice(1)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {a.target} · {ago(a.at)}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* Occupancy per property */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Your properties</h2>
          {can('properties.manage') && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/app/properties/new')}>
              <Plus /> Add property
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((p) => {
            const o = occupancy(db, p.id)
            const open = db.complaints.filter(
              (c) => c.propertyId === p.id && (c.status === 'open' || c.status === 'in_progress'),
            ).length
            const due = db.invoices
              .filter((i) => i.propertyId === p.id && i.status === 'overdue')
              .reduce((s, i) => s + balance(i), 0)
            return (
              <Link
                key={p.id}
                to={`/app/properties/${p.id}`}
                className="rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.locality}</p>
                  </div>
                  {p.status === 'draft' ? (
                    <Badge>Not finished</Badge>
                  ) : (
                    <Badge tone="good" dot>
                      Open
                    </Badge>
                  )}
                </div>
                <div className="mt-4 flex items-baseline justify-between text-sm">
                  <span>
                    <span className="text-lg font-semibold tabular-nums">{o.filled}</span>
                    <span className="text-muted-foreground"> / {o.beds} beds filled</span>
                  </span>
                  <span className="font-medium tabular-nums">{o.pct}%</span>
                </div>
                <div className="mt-2">
                  <Meter value={o.filled} max={o.beds} label={`${p.name} beds filled`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{plural(o.vacant, 'vacant bed')}</span>
                  {o.reserved > 0 && <span>{o.reserved} reserved</span>}
                  <span>{plural(open, 'open complaint')}</span>
                  {seeMoney && due > 0 && (
                    <span className="text-red-600">{formatMoney(due)} overdue</span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <RecordPaymentDialog invoiceId={payFor} onOpenChange={(o) => !o && setPayFor(null)} />
    </div>
  )
}

function inPropFn(x: { propertyId?: string }, propertyId: string) {
  return !propertyId || x.propertyId === propertyId
}

function DismissButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      aria-label="Close this reminder"
      onClick={() => dismissedStore.set((d) => [...d, id])}
      className="-m-1 rounded p-1 opacity-70 hover:bg-black/5 hover:opacity-100"
    >
      <X className="size-4" />
    </button>
  )
}
