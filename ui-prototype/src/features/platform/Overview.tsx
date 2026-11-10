import {
  AlertTriangle,
  BedDouble,
  Building,
  CreditCard,
  Hourglass,
  IndianRupee,
  LifeBuoy,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'

import { Avatar, Bars, Section, Status } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { TODAY } from '../../data/seed'
import { useDb } from '../../data/store'
import { formatDate, formatMoney, formatMonth, plural, shiftPeriod } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { useExtras } from './extras'
import { PLAN_STATUS, addDays, daysAgo } from './util'

export function Overview() {
  useBreadcrumbs([{ label: 'Overview' }])
  const navigate = useNavigate()
  const businesses = useDb((db) => db.platformBusinesses)
  const queue = useDb((db) => db.verificationQueue)
  const tickets = useDb((db) => db.supportTickets)
  const payments = useDb((db) => db.platformPayments)
  const plans = useExtras((x) => x.plans)
  const trialEnds = useExtras((x) => x.trialEnds)

  const stats = useMemo(() => {
    const live = businesses.filter((b) => b.status === 'active')
    const paying = live.filter((b) => b.plan !== 'free' && b.planStatus === 'active')
    const weekEnd = addDays(TODAY, 7)
    const trials = businesses.filter((b) => b.planStatus === 'trial')
    const endingSoon = trials.filter((b) => (trialEnds[b.id] ?? '9999') <= weekEnd)
    const nextTrial = trials
      .map((b) => trialEnds[b.id])
      .filter(Boolean)
      .sort()[0]
    return {
      total: businesses.length,
      paying: paying.length,
      mrr: paying.reduce((s, b) => s + b.mrr, 0),
      trials: trials.length,
      endingSoon: endingSoon.length,
      nextTrial,
      beds: businesses.reduce((s, b) => s + b.beds, 0),
      tenants: businesses.reduce((s, b) => s + b.tenants, 0),
      waiting: queue.filter((v) => v.status === 'submitted' || v.status === 'under_review').length,
      oldestWaiting: queue
        .filter((v) => v.status === 'submitted')
        .map((v) => v.submittedOn)
        .sort()[0],
      openTickets: tickets.filter((t) => t.status === 'open').length,
      urgentTickets: tickets.filter((t) => t.status === 'open' && t.priority === 'urgent').length,
    }
  }, [businesses, queue, tickets, trialEnds])

  const signups = useMemo(() => {
    const months = Array.from({ length: 8 }, (_, i) => shiftPeriod(TODAY.slice(0, 7), i - 7))
    return months.map((m) => ({
      label: formatMonth(m).slice(0, 3),
      value: businesses.filter((b) => b.joinedOn.startsWith(m)).length,
    }))
  }, [businesses])

  const mix = useMemo(
    () =>
      plans.map((p) => {
        const list = businesses.filter((b) => b.plan === p.code)
        return {
          plan: p,
          count: list.length,
          mrr: list.filter((b) => b.planStatus === 'active').reduce((s, b) => s + b.mrr, 0),
        }
      }),
    [plans, businesses],
  )

  const recent = useMemo(
    () => [...businesses].sort((a, b) => b.joinedOn.localeCompare(a.joinedOn)).slice(0, 6),
    [businesses],
  )

  const failed = payments.filter((p) => p.status === 'failed')
  const suspended = businesses.filter((b) => b.status === 'suspended')
  const pastDue = businesses.filter((b) => b.planStatus === 'past_due')
  const planName = (code: string) => plans.find((p) => p.code === code)?.name ?? code

  return (
    <>
      <PageHeader
        title="Good morning, San"
        description={`PG Manager across Bengaluru · ${formatDate(TODAY)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/platform/verification">
                <ShieldCheck /> Review checks
              </Link>
            </Button>
            <Button asChild>
              <Link to="/platform/businesses">
                <Building /> All businesses
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Businesses"
          value={stats.total}
          icon={<Building />}
          hint={`${plural(suspended.length, 'suspended account')}`}
        />
        <StatCard
          label="Paying businesses"
          value={stats.paying}
          icon={<CreditCard />}
          hint={`${Math.round((stats.paying / Math.max(1, stats.total)) * 100)}% of all businesses`}
        />
        <StatCard
          label="Monthly income (MRR)"
          value={formatMoney(stats.mrr)}
          icon={<IndianRupee />}
          hint={`${formatMoney(stats.mrr * 12)} a year at this rate`}
        />
        <StatCard
          label="Trials ending this week"
          value={stats.endingSoon}
          icon={<Hourglass />}
          hint={
            stats.nextTrial
              ? `${plural(stats.trials, 'trial')} · next ends ${formatDate(stats.nextTrial)}`
              : 'No trials running'
          }
        />
        <StatCard
          label="Beds managed"
          value={stats.beds.toLocaleString('en-IN')}
          icon={<BedDouble />}
          hint="Across all properties"
        />
        <StatCard
          label="Tenants managed"
          value={stats.tenants.toLocaleString('en-IN')}
          icon={<Users />}
          hint={`${Math.round((stats.tenants / Math.max(1, stats.beds)) * 100)}% of beds filled`}
        />
        <StatCard
          label="Checks waiting"
          value={stats.waiting}
          icon={<ShieldCheck />}
          hint={
            stats.oldestWaiting ? `Oldest sent ${daysAgo(stats.oldestWaiting)}` : 'Nothing waiting'
          }
        />
        <StatCard
          label="Open tickets"
          value={stats.openTickets}
          icon={<LifeBuoy />}
          hint={stats.urgentTickets ? `${stats.urgentTickets} urgent` : 'None urgent'}
        />
      </div>

      {(failed.length > 0 || suspended.length > 0 || pastDue.length > 0) && (
        <Section title="Needs attention" className="mt-6" bodyClassName="p-0">
          <ul className="divide-y">
            {failed.map((p) => {
              const biz = businesses.find((b) => b.name === p.business)
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <AlertTriangle className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      Plan payment of {formatMoney(p.amount)} failed – {p.business}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {planName(p.plan)} plan · {formatDate(p.paidOn)} · {p.reference}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/platform/payments?status=failed')}
                  >
                    Retry or email
                  </Button>
                  {biz && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/platform/businesses/${biz.id}`)}
                    >
                      Open business
                    </Button>
                  )}
                </li>
              )
            })}
            {pastDue
              .filter((b) => !failed.some((p) => p.business === b.name))
              .map((b) => (
                <li key={`due-${b.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <CreditCard className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{b.name}: plan payment failed</p>
                    <p className="text-xs text-muted-foreground">
                      {b.owner} · {b.phone} · last active {daysAgo(b.lastActive)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/platform/businesses/${b.id}`)}
                  >
                    Open business
                  </Button>
                </li>
              ))}
            {suspended.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <AlertTriangle className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{b.name} is suspended</p>
                  <p className="text-xs text-muted-foreground">
                    {b.owner} · {b.phone} · {plural(b.tenants, 'tenant')} can’t see their bills
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/platform/businesses/${b.id}`)}
                >
                  Review
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section
          title="New businesses each month"
          description={`${plural(
            signups.reduce((s, d) => s + d.value, 0),
            'sign-up',
          )} in the last 8 months`}
          className="lg:col-span-2"
        >
          <Bars data={signups} height={180} />
        </Section>
        <Section title="Plan mix" description="Businesses on each plan">
          <ul className="grid gap-4">
            {mix.map(({ plan, count, mrr }, i) => (
              <li key={plan.code}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{plan.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {count} · {formatMoney(mrr)}/mo
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${(count / Math.max(1, stats.total)) * 100}%`,
                      opacity: 0.4 + i * 0.2,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section
        title="Recent sign-ups"
        className="mt-6"
        bodyClassName="p-0"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/platform/businesses">See all</Link>
          </Button>
        }
      >
        <Table>
          <THead>
            <TR>
              <TH>Business</TH>
              <TH>Area</TH>
              <TH>Plan</TH>
              <TH className="text-right">Beds</TH>
              <TH>Joined</TH>
            </TR>
          </THead>
          <TBody>
            {recent.map((b) => (
              <TR
                key={b.id}
                className="cursor-pointer"
                onClick={() => navigate(`/platform/businesses/${b.id}`)}
              >
                <TD>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={b.name} hue={(Number(b.id.slice(1)) * 47) % 360} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium whitespace-nowrap">{b.name}</p>
                      <p className="text-xs text-muted-foreground">{b.owner}</p>
                    </div>
                  </div>
                </TD>
                <TD className="whitespace-nowrap">{b.city}</TD>
                <TD>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="outline">{planName(b.plan)}</Badge>
                    <Status of={PLAN_STATUS} value={b.planStatus} />
                  </div>
                </TD>
                <TD className="text-right tabular-nums">{b.beds}</TD>
                <TD className="whitespace-nowrap">{formatDate(b.joinedOn)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
    </>
  )
}
