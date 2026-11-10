import {
  ArrowRight,
  BedDouble,
  Building2,
  CalendarClock,
  DoorOpen,
  IndianRupee,
  Inbox,
  Megaphone,
  Plus,
  Users,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { download } from '../../api/client'
import { useApi, useList } from '../../api/hooks'
import type { Dashboard, Property } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { ErrorBanner, PeriodSwitcher } from '../../components/ui'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { EmptyState, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { NativeSelect } from '../../components/ui-kit/input'
import { EmailReminder } from '../../features/onboarding/EmailReminder'
import { OwnerCheckPrompt } from '../../features/onboarding/OwnerCheckPrompt'
import { cn } from '../../lib/cn'
import { currentPeriod, formatDate, formatMoney, formatMonth, initials } from '../../lib/format'

/** Rupees without paise for big headline numbers ("₹2,16,333"). */
function rupees(paise: number) {
  return formatMoney(Math.round(paise / 100) * 100)
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** Occupancy ring: one arc per bed status, drawn to scale. */
function OccupancyRing({ beds }: { beds: Dashboard['beds'] }) {
  const parts = [
    { value: beds.occupied, className: 'stroke-primary' },
    { value: beds.reserved, className: 'stroke-amber-400' },
    { value: beds.blocked, className: 'stroke-slate-300' },
  ]
  const r = 52
  const c = 2 * Math.PI * r
  let offset = 0
  const pct = beds.total ? Math.round((beds.occupied / beds.total) * 100) : 0
  return (
    <div className="relative size-[140px] shrink-0">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden>
        <circle cx="64" cy="64" r={r} fill="none" strokeWidth="12" className="stroke-secondary" />
        {parts.map((p, i) => {
          const len = beds.total ? (p.value / beds.total) * c : 0
          const el = (
            <circle
              key={i}
              cx="64"
              cy="64"
              r={r}
              fill="none"
              strokeWidth="12"
              strokeLinecap="butt"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              className={cn(p.className, 'transition-[stroke-dasharray] duration-700 ease-out')}
            />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
          {pct}%
        </span>
        <span className="mt-1 text-[11.5px] text-muted-foreground">beds filled</span>
      </div>
    </div>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className={cn('size-2 rounded-[3px]', color)} aria-hidden />
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
  to,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  tone?: 'bad' | 'warn'
  to?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-md [&_svg]:size-3.5',
            tone === 'bad'
              ? 'bg-red-50 text-red-600'
              : tone === 'warn'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-secondary text-muted-foreground',
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-[26px] leading-none font-semibold tracking-[-0.025em] tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </>
  )
  const cls =
    'block rounded-xl border bg-card p-4 shadow-xs transition-[box-shadow,border-color] duration-200'
  return to ? (
    <Link to={to} className={cn(cls, 'no-underline hover:border-border-strong hover:shadow-sm')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function QuickAction({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-[13.5px] font-medium text-foreground no-underline shadow-xs transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm"
    >
      <span className="flex size-8 items-center justify-center rounded-md bg-primary-soft text-accent-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      <ArrowRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-5" role="status" aria-label="Loading">
      <div className="grid gap-5 lg:grid-cols-5">
        <Skeleton className="h-[220px] lg:col-span-2" />
        <Skeleton className="h-[220px] lg:col-span-3" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[118px]" />
        ))}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { can, membership, user } = useAuth()
  const [period, setPeriod] = useState(currentPeriod())
  const [property, setProperty] = useState('')
  const properties = useList<Property>('/properties/')
  const { data, isLoading, error } = useApi<Dashboard>('/reports/dashboard', { period, property })
  const firstName = (user?.full_name ?? '').split(' ')[0]
  const money = data?.money
  const collectedPct =
    money && money.invoiced > 0
      ? Math.min(100, Math.round((money.collected / money.invoiced) * 100))
      : 0

  return (
    <>
      <EmailReminder />
      <OwnerCheckPrompt />
      <PageHeader
        eyebrow={
          <p className="text-[13px] font-medium text-muted-foreground">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </p>
        }
        title="Dashboard"
        description={`${membership?.organization.name ?? ''} · ${formatMonth(period)}`}
        actions={
          <>
            <PeriodSwitcher period={period} onChange={setPeriod} />
            <NativeSelect
              aria-label="Property"
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              className="w-auto min-w-44"
            >
              <option value="">All properties</option>
              {properties.rows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </>
        }
      />
      <ErrorBanner error={error} />
      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : data.beds.total === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="Add your first property"
          actions={
            <Button asChild>
              <Link to="/app/properties">
                <Plus /> Add a property
              </Link>
            </Button>
          }
        >
          Occupancy, rent and complaints show up here as soon as you add rooms and beds.
        </EmptyState>
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Occupancy"
                description={`${data.beds.occupied} of ${data.beds.total} beds have a tenant`}
                actions={
                  <Link
                    to="/app/properties"
                    className="text-[13px] font-medium text-primary no-underline hover:underline"
                  >
                    Rooms
                  </Link>
                }
              />
              <CardContent className="flex flex-wrap items-center gap-6">
                <OccupancyRing beds={data.beds} />
                <div className="grid min-w-40 flex-1 gap-2.5">
                  <Legend color="bg-primary" label="Filled" value={data.beds.occupied} />
                  <Legend color="bg-emerald-400" label="Vacant" value={data.beds.vacant} />
                  <Legend color="bg-amber-400" label="Reserved" value={data.beds.reserved} />
                  <Legend color="bg-slate-300" label="Not available" value={data.beds.blocked} />
                </div>
              </CardContent>
            </Card>

            {money ? (
              <Card className="lg:col-span-3">
                <CardHeader
                  title={`Rent for ${formatMonth(period)}`}
                  description="Bills sent this month and what has come in"
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        download(
                          '/reports/collections.csv',
                          { period },
                          `collections-${period}.csv`,
                        )
                      }
                    >
                      Download collections (CSV)
                    </Button>
                  }
                />
                <CardContent>
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[13px] text-muted-foreground">Collected</p>
                      <p className="mt-1 text-[34px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
                        {rupees(money.collected)}
                      </p>
                    </div>
                    <p className="text-[13px] text-muted-foreground tabular-nums">
                      <span className="font-semibold text-foreground">{collectedPct}%</span> of{' '}
                      {rupees(money.invoiced)} billed
                    </p>
                  </div>
                  <div
                    className="mt-4 h-2.5 overflow-hidden rounded-full bg-secondary"
                    role="meter"
                    aria-label="Rent collected"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={collectedPct}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[oklch(0.55_0.1_175)] to-primary transition-[width] duration-700 ease-out"
                      style={{ width: `${collectedPct}%` }}
                    />
                  </div>
                  <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      ['Invoiced', formatMoney(money.invoiced), ''],
                      ['Outstanding (all months)', formatMoney(money.outstanding), ''],
                      [
                        `Overdue (${money.overdue_invoices} invoices)`,
                        formatMoney(money.overdue),
                        money.overdue ? 'text-destructive' : '',
                      ],
                    ].map(([k, v, tone]) => (
                      <div key={k} className="rounded-lg bg-secondary/60 px-3 py-2.5">
                        <dt className="text-xs text-muted-foreground">{k}</dt>
                        <dd className={cn('mt-1 text-[15px] font-semibold tabular-nums', tone)}>
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {can('rent.view') && money.overdue_invoices > 0 && (
                    <Link
                      to="/app/billing?overdue=true"
                      className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-primary no-underline hover:underline"
                    >
                      See overdue invoices <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="lg:col-span-3">
                <CardHeader title="Today" description="What needs you in the PG" />
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  <QuickAction to="/app/complaints" icon={<Wrench />} label="Open complaints" />
                  <QuickAction to="/app/notices" icon={<Megaphone />} label="Post a notice" />
                  <QuickAction to="/app/tenants" icon={<Users />} label="Find a tenant" />
                  <QuickAction to="/app/properties" icon={<BedDouble />} label="Rooms and beds" />
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label="Current tenants"
              value={data.tenants.current}
              hint={`${data.tenants.checked_in_this_period} moved in this month`}
              icon={<Users />}
              to="/app/tenants"
            />
            <Kpi
              label="Vacant beds"
              value={data.beds.vacant}
              hint={data.beds.reserved ? `${data.beds.reserved} reserved` : 'Ready for new tenants'}
              icon={<DoorOpen />}
              to="/app/properties"
            />
            <Kpi
              label="On notice"
              value={data.tenants.on_notice}
              hint="Leaving in the next 30 days"
              icon={<CalendarClock />}
              tone={data.tenants.on_notice ? 'warn' : undefined}
            />
            <Kpi
              label="Open complaints"
              value={data.complaints.open}
              hint={
                data.complaints.high_priority_open
                  ? `${data.complaints.high_priority_open} high priority`
                  : 'Nothing urgent'
              }
              icon={<Wrench />}
              tone={data.complaints.high_priority_open ? 'bad' : undefined}
              to="/app/complaints"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Upcoming checkouts (next 30 days)"
                description="Tenants on notice, by the date they leave"
              />
              {data.upcoming_checkouts.length === 0 ? (
                <CardContent>
                  <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">
                    No one is on notice.
                  </p>
                </CardContent>
              ) : (
                <ul className="border-t">
                  {data.upcoming_checkouts.map((c) => (
                    <li
                      key={c.stay_id}
                      className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                        {initials(c.tenant_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{c.tenant_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.property_name} · {c.place_label}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 tabular-nums">
                        {formatDate(c.expected_checkout)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="grid content-start gap-5">
              <Card>
                <CardHeader title="Quick actions" />
                <CardContent className="grid gap-2">
                  {can('tenants.manage') && (
                    <QuickAction to="/app/tenants" icon={<Users />} label="Add or find a tenant" />
                  )}
                  {can('rent.collect') && (
                    <QuickAction
                      to="/app/billing"
                      icon={<IndianRupee />}
                      label="Record a payment"
                    />
                  )}
                  <QuickAction to="/app/complaints" icon={<Wrench />} label="Log a complaint" />
                  <QuickAction to="/app/notices" icon={<Megaphone />} label="Post a notice" />
                </CardContent>
              </Card>
              {data.enquiries && (
                <Card>
                  <CardContent className="flex items-center gap-3 pt-5">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                      <Inbox className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">Marketplace leads</p>
                      <p className="text-xs text-muted-foreground">
                        <strong className="text-foreground">{data.enquiries.new}</strong> new
                        enquiries
                      </p>
                    </div>
                    <Link
                      to="/app/enquiries"
                      className="text-[13px] font-medium text-primary no-underline hover:underline"
                    >
                      Open inbox
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
