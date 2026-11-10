/** Staff & salaries: who works where, what they earn, and paying them. */
import {
  Banknote,
  CalendarCheck,
  Clock,
  HardHat,
  IndianRupee,
  Plus,
  Users,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import {
  Avatar,
  FilterChips,
  Money,
  NoAccess,
  PropertyPicker,
  SearchBox,
  Toolbar,
} from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { EmptyState, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { NativeSelect } from '../../components/ui-kit/input'
import { THIS_MONTH, TODAY } from '../../data/seed'
import { STAFF_ROLE } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { Staff } from '../../data/types'
import { useSession } from '../../demo/session'
import { formatMonth } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { useExtras } from './extras'
import { PaySalariesDialog, StaffDialog } from './staff-parts'
import { KpiRow } from './shared'
import { hueOf } from './helpers'

type StatusFilter = 'working' | 'on_leave' | 'left' | 'all'

export const STAFF_STATUS = {
  active: { label: 'Working', tone: 'good' },
  on_leave: { label: 'On leave', tone: 'warn' },
  left: { label: 'Left', tone: 'neutral' },
} as const

export function StaffPage() {
  useBreadcrumbs([{ label: 'Staff & salaries' }])
  const { can } = useSession()
  const staff = useDb((db) => db.staff)
  const properties = useDb((db) => db.properties)
  const attendance = useExtras((x) => x.attendance)
  const [query, setQuery] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [role, setRole] = useState<'' | Staff['role']>('')
  const [status, setStatus] = useState<StatusFilter>('working')
  const [adding, setAdding] = useState(false)
  const [paying, setPaying] = useState(false)

  const current = staff.filter((s) => s.status !== 'left')
  const bill = current.reduce((s, x) => s + x.salary, 0)
  const paidThisMonth = staff
    .flatMap((s) => s.salaryPaid)
    .filter((p) => p.paidOn.startsWith(THIS_MONTH))
    .reduce((s, p) => s + p.amount, 0)
  const pendingStaff = current.filter((s) => !s.salaryPaid.some((p) => p.period === THIS_MONTH))
  const pending = pendingStaff.reduce((s, x) => s + x.salary, 0)

  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    return staff
      .filter((s) => !propertyId || s.propertyIds.includes(propertyId))
      .filter((s) => !role || s.role === role)
      .filter((s) => !q || `${s.name} ${s.phone} ${STAFF_ROLE[s.role]}`.toLowerCase().includes(q))
  }, [staff, propertyId, role, query])
  const rows = base.filter((s) =>
    status === 'all' ? true : status === 'working' ? s.status === 'active' : s.status === status,
  )

  if (!can('salaries.manage')) return <NoAccess what="staff and salaries" />
  const today = Number(TODAY.slice(8))
  const month = formatMonth(THIS_MONTH).split(' ')[0]

  return (
    <>
      <PageHeader
        title="Staff & salaries"
        description="Cooks, cleaners, guards and others, with their salary and attendance."
        actions={
          <>
            <Button variant="outline" onClick={() => setPaying(true)}>
              <Banknote /> Pay salaries
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add staff
            </Button>
          </>
        }
      />

      <KpiRow>
        <StatCard
          label="Staff"
          value={current.length}
          icon={<Users />}
          hint={`${current.filter((s) => s.status === 'on_leave').length} on leave`}
        />
        <StatCard
          label="Monthly salary bill"
          value={<Money value={bill} />}
          icon={<Wallet />}
          hint="All current staff"
        />
        <StatCard
          label="Paid this month"
          value={<Money value={paidThisMonth} />}
          icon={<IndianRupee />}
          hint={`Salaries paid since 1 ${month}`}
        />
        <StatCard
          label={`${month} salary pending`}
          value={<Money value={pending} />}
          icon={<Clock />}
          hint={`${pendingStaff.length} people · due 30 ${month}`}
        />
      </KpiRow>

      <Toolbar>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search name or mobile"
          className="max-w-xs"
        />
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
        <NativeSelect
          aria-label="Work"
          value={role}
          onChange={(e) => setRole(e.target.value as Staff['role'] | '')}
          className="h-9 w-auto"
        >
          <option value="">All kinds of work</option>
          {(Object.keys(STAFF_ROLE) as Staff['role'][]).map((r) => (
            <option key={r} value={r}>
              {STAFF_ROLE[r]}
            </option>
          ))}
        </NativeSelect>
      </Toolbar>
      <div className="mb-5">
        <FilterChips
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            {
              value: 'working',
              label: 'Working',
              count: base.filter((s) => s.status === 'active').length,
            },
            {
              value: 'on_leave',
              label: 'On leave',
              count: base.filter((s) => s.status === 'on_leave').length,
            },
            { value: 'left', label: 'Left', count: base.filter((s) => s.status === 'left').length },
            { value: 'all', label: 'All', count: base.length },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<HardHat />}
          title="No staff match"
          actions={
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus /> Add staff
            </Button>
          }
        >
          Try another filter, or add the people who work at your PGs.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => {
            const paid = s.salaryPaid.some((p) => p.period === THIS_MONTH)
            const marks = attendance[s.id] ?? {}
            const present = Object.entries(marks).filter(
              ([d, m]) => Number(d) <= today && m === 'present',
            ).length
            return (
              <Link
                key={s.id}
                to={`/app/staff/${s.id}`}
                className="group rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={s.name} hue={hueOf(s.name)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold group-hover:underline">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{STAFF_ROLE[s.role]}</p>
                  </div>
                  <Badge tone={STAFF_STATUS[s.status].tone} dot>
                    {STAFF_STATUS[s.status].label}
                  </Badge>
                </div>
                <p className="mt-3 truncate text-xs text-muted-foreground">
                  {s.propertyIds.map((id) => properties.find((p) => p.id === id)?.name).join(', ')}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-secondary/50 p-2.5 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Shift</dt>
                    <dd className="mt-0.5 font-medium">{s.shift}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Salary</dt>
                    <dd className="mt-0.5 font-medium">
                      <Money value={s.salary} />
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-muted-foreground">
                      <CalendarCheck className="size-3" /> Present
                    </dt>
                    <dd className="mt-0.5 font-medium">
                      {present} of {today} days
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{month} salary</span>
                  {s.status === 'left' ? (
                    <span className="text-muted-foreground">—</span>
                  ) : paid ? (
                    <Badge tone="good">Paid</Badge>
                  ) : (
                    <Badge tone="warn">Pending</Badge>
                  )}
                </div>
                {!s.idProof && (
                  <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    ID proof not added yet
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {adding && <StaffDialog onClose={() => setAdding(false)} />}
      {paying && <PaySalariesDialog onClose={() => setPaying(false)} />}
    </>
  )
}
