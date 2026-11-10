import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  IndianRupee,
  MoreHorizontal,
  ReceiptText,
  Sparkles,
  User,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { api } from '../../api/client'
import { useApiMutation, useList } from '../../api/hooks'
import type { GenerateResult, Invoice, Property } from '../../api/types'
import { ErrorBanner, PeriodSwitcher } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardFooter, CardHeader } from '../../components/ui-kit/card'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Alert, EmptyState, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { NativeSelect } from '../../components/ui-kit/input'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui-kit/menu'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { cn } from '../../lib/cn'
import { currentPeriod, formatDate, formatMoney, formatMonth, initials } from '../../lib/format'

type Tone = 'good' | 'warn' | 'bad' | 'neutral'

/** Plain-word status of an invoice, as owners say it. */
function invoiceStatus(inv: Pick<Invoice, 'status' | 'is_overdue'>): {
  label: string
  tone: Tone
} {
  if (inv.is_overdue) return { label: 'Overdue', tone: 'bad' }
  switch (inv.status) {
    case 'paid':
      return { label: 'Paid', tone: 'good' }
    case 'partially_paid':
      return { label: 'Partly paid', tone: 'warn' }
    case 'void':
      return { label: 'Void', tone: 'neutral' }
    default:
      return { label: 'Unpaid', tone: 'warn' }
  }
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Any status' },
  { value: 'issued', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Partly paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
]

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
  loading,
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  tone?: 'good' | 'bad'
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-md [&_svg]:size-3.5',
            tone === 'bad'
              ? 'bg-red-50 text-red-600'
              : tone === 'good'
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-secondary text-muted-foreground',
          )}
        >
          {icon}
        </span>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-[26px] w-28" />
          <Skeleton className="mt-2.5 h-3 w-20" />
        </>
      ) : (
        <>
          <p
            className={cn(
              'mt-3 text-[22px] leading-none font-semibold tracking-[-0.025em] tabular-nums sm:text-[26px]',
              tone === 'bad' && 'text-destructive',
            )}
          >
            {value}
          </p>
          {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
          {children}
        </>
      )}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="border-t" role="status" aria-label="Loading">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <Skeleton className="size-8 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-3.5 w-24 md:block" />
          <Skeleton className="hidden h-3.5 w-20 md:block" />
          <Skeleton className="h-[22px] w-16" />
        </div>
      ))}
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
      {initials(name)}
    </span>
  )
}

export function BillingPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const overdueOnly = params.get('overdue') === 'true'
  const [period, setPeriod] = useState(currentPeriod())
  const [property, setProperty] = useState('')
  const [status, setStatus] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const properties = useList<Property>('/properties/')
  const query = overdueOnly ? { overdue: true, property } : { period, property, status }
  const { rows, isLoading, error, hasMore } = useList<Invoice>('/invoices/', query)

  const generate = useApiMutation(
    () =>
      api.post<GenerateResult>('/invoices/generate/', {
        period,
        ...(property ? { property } : {}),
      }),
    ['/invoices/', '/reports/'],
    (result) =>
      setMessage(
        result.created
          ? `Created ${result.created} invoice${result.created === 1 ? '' : 's'} for ${formatMonth(period)}.`
          : `Every stay already has an invoice for ${formatMonth(period)}.`,
      ),
  )
  const totals = rows.reduce(
    (acc, inv) =>
      inv.status === 'void' ? acc : { total: acc.total + inv.total, paid: acc.paid + inv.paid },
    { total: 0, paid: 0 },
  )
  const balance = totals.total - totals.paid
  const collectedPct = totals.total > 0 ? Math.round((totals.paid / totals.total) * 100) : 0
  const overdueCount = rows.filter((inv) => inv.is_overdue).length
  const openCount = rows.filter((inv) => inv.status !== 'void' && inv.balance > 0).length

  const propertySelect = (
    <NativeSelect
      aria-label="Property"
      value={property}
      onChange={(e) => setProperty(e.target.value)}
      className="w-full min-w-44 sm:w-auto"
    >
      <option value="">All properties</option>
      {properties.rows.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </NativeSelect>
  )

  return (
    <>
      <PageHeader
        title="Rent & payments"
        description={
          overdueOnly
            ? 'Every bill past its due date that still has money to collect.'
            : 'Monthly rent bills, payments received and what is still due.'
        }
        actions={
          !overdueOnly && (
            <Button
              busy={generate.isPending}
              onClick={() => {
                setMessage(null)
                generate.mutate(undefined)
              }}
            >
              {!generate.isPending && <Sparkles />}
              Generate rent for {formatMonth(period)}
            </Button>
          )
        }
      />

      <div className="grid gap-5">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {overdueOnly ? (
            <>
              <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-600/15 bg-red-50 px-3 text-[13px] font-medium text-red-800">
                <AlertTriangle className="size-4 text-red-600" aria-hidden />
                Overdue invoices (all months)
              </span>
              <Button variant="outline" onClick={() => setParams({})}>
                <CalendarDays /> Show by month
              </Button>
            </>
          ) : (
            <>
              <PeriodSwitcher period={period} onChange={setPeriod} />
              <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
                <Segmented
                  label="Status"
                  value={status || 'all'}
                  onChange={(v) => setStatus(v === 'all' ? '' : v)}
                  options={STATUS_FILTERS}
                />
              </div>
              <Button variant="outline" onClick={() => setParams({ overdue: 'true' })}>
                <AlertTriangle className="text-red-600" /> Overdue only
              </Button>
            </>
          )}
          <div className="w-full sm:ml-auto sm:w-auto">{propertySelect}</div>
        </div>

        {message && <Alert tone="good">{message}</Alert>}
        <ErrorBanner error={generate.error ?? error} />

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi
            label="Billed"
            value={formatMoney(totals.total)}
            hint={overdueOnly ? 'Overdue bills, all months' : formatMonth(period)}
            icon={<FileText />}
            loading={isLoading}
          />
          <Kpi
            label="Received"
            value={formatMoney(totals.paid)}
            hint={`${collectedPct}% of billed`}
            icon={<Wallet />}
            tone="good"
            loading={isLoading}
          >
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"
              role="meter"
              aria-label="Rent received"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={collectedPct}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[oklch(0.55_0.1_175)] to-primary transition-[width] duration-700 ease-out"
                style={{ width: `${collectedPct}%` }}
              />
            </div>
          </Kpi>
          <Kpi
            label="Balance"
            value={formatMoney(balance)}
            hint={balance > 0 ? 'Still to collect' : 'Nothing left to collect'}
            icon={<IndianRupee />}
            tone={balance > 0 ? 'bad' : undefined}
            loading={isLoading}
          />
          <Kpi
            label="Invoices"
            value={rows.length}
            hint={
              overdueCount
                ? `${openCount} unpaid · ${overdueCount} overdue`
                : openCount
                  ? `${openCount} unpaid`
                  : 'All settled'
            }
            icon={<ReceiptText />}
            loading={isLoading}
          />
        </div>

        {/* Invoices */}
        {!isLoading && rows.length === 0 ? (
          <EmptyState
            icon={overdueOnly ? <CheckCircle2 /> : <ReceiptText />}
            title={
              overdueOnly ? 'Nothing is overdue.' : `No invoices for ${formatMonth(period)} yet.`
            }
          >
            {overdueOnly
              ? 'Every bill that is past its due date has been paid.'
              : 'Use “Generate rent” to bill every tenant for the month.'}
          </EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader
              title={overdueOnly ? 'Overdue invoices' : `Invoices for ${formatMonth(period)}`}
              description={
                isLoading
                  ? 'Loading…'
                  : `${rows.length} invoice${rows.length === 1 ? '' : 's'} · ${formatMoney(balance)} still due`
              }
            />
            {isLoading ? (
              <TableSkeleton />
            ) : (
              <>
                {/* Desktop and tablet: table */}
                <div className="hidden border-t md:block">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Tenant</TH>
                        <TH>Invoice</TH>
                        <TH>Due</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="text-right">Balance</TH>
                        <TH>Status</TH>
                        <TH className="w-10">
                          <span className="sr-only">Actions</span>
                        </TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rows.map((inv) => {
                        const st = invoiceStatus(inv)
                        return (
                          <TR key={inv.id}>
                            <TD>
                              <div className="flex items-center gap-3">
                                <Avatar name={inv.details.tenant_name} />
                                <div className="min-w-0">
                                  <Link
                                    to={`/app/tenants/${inv.details.tenant_id}`}
                                    className="block truncate text-[13.5px] font-medium text-foreground no-underline hover:underline"
                                  >
                                    {inv.details.tenant_name}
                                  </Link>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {inv.details.property_name} · {inv.details.place_label}
                                  </p>
                                </div>
                              </div>
                            </TD>
                            <TD>
                              <Link
                                to={`/app/billing/invoices/${inv.id}`}
                                className="font-mono text-[12.5px] font-medium whitespace-nowrap text-primary no-underline hover:underline"
                              >
                                {inv.number}
                              </Link>
                            </TD>
                            <TD
                              className={cn(
                                'whitespace-nowrap',
                                inv.is_overdue ? 'text-destructive' : 'text-muted-foreground',
                              )}
                            >
                              {formatDate(inv.due_date)}
                            </TD>
                            <TD className="text-right whitespace-nowrap text-muted-foreground">
                              {formatMoney(inv.total)}
                            </TD>
                            <TD
                              className={cn(
                                'text-right font-medium whitespace-nowrap',
                                inv.balance === 0 && 'text-subtle-foreground',
                              )}
                            >
                              {formatMoney(inv.balance)}
                            </TD>
                            <TD>
                              <Badge tone={st.tone} dot>
                                {st.label}
                              </Badge>
                            </TD>
                            <TD className="text-right">
                              <Menu>
                                <MenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Actions for ${inv.number}`}
                                  >
                                    <MoreHorizontal />
                                  </Button>
                                </MenuTrigger>
                                <MenuContent>
                                  <MenuItem
                                    icon={<FileText />}
                                    onSelect={() => navigate(`/app/billing/invoices/${inv.id}`)}
                                  >
                                    Open invoice
                                  </MenuItem>
                                  <MenuItem
                                    icon={<User />}
                                    onSelect={() =>
                                      navigate(`/app/tenants/${inv.details.tenant_id}`)
                                    }
                                  >
                                    Open tenant
                                  </MenuItem>
                                </MenuContent>
                              </Menu>
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                </div>

                {/* Phone: one card per invoice */}
                <ul className="border-t md:hidden">
                  {rows.map((inv) => {
                    const st = invoiceStatus(inv)
                    return (
                      <li key={inv.id} className="border-b last:border-b-0">
                        <Link
                          to={`/app/billing/invoices/${inv.id}`}
                          aria-label={`${inv.number} · ${inv.details.tenant_name} · ${formatMoney(inv.balance)} due`}
                          className="flex items-center gap-3 px-4 py-3.5 text-foreground no-underline active:bg-secondary/60"
                        >
                          <Avatar name={inv.details.tenant_name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[13.5px] font-medium">
                                {inv.details.tenant_name}
                              </p>
                              <p className="shrink-0 text-[13.5px] font-semibold tabular-nums">
                                {formatMoney(inv.balance)}
                              </p>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {inv.details.property_name} · {inv.details.place_label}
                            </p>
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <span className="truncate text-xs text-subtle-foreground tabular-nums">
                                Due {formatDate(inv.due_date)} · {inv.number}
                              </span>
                              <Badge tone={st.tone} dot>
                                {st.label}
                              </Badge>
                            </div>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-subtle-foreground" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
            {hasMore && (
              <CardFooter className="justify-start text-[13px] text-muted-foreground">
                Showing the first 100 invoices. Filter by property to narrow down.
              </CardFooter>
            )}
          </Card>
        )}
      </div>
    </>
  )
}
