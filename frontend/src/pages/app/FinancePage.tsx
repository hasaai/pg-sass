import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  IndianRupee,
  MoreHorizontal,
  Percent,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'

import { api, download } from '../../api/client'
import { useApi, useApiMutation, useList } from '../../api/hooks'
import type { Expense, FinanceSummary, Property } from '../../api/types'
import { ErrorBanner, PeriodSwitcher, SelectField, TextField } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { NativeSelect } from '../../components/ui-kit/input'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui-kit/menu'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { cn } from '../../lib/cn'
import {
  currentPeriod,
  formatDate,
  formatMoney,
  formatMonth,
  rupeesToPaise,
  todayISO,
} from '../../lib/format'
import { EXPENSE_CATEGORIES, PAYMENT_MODES, optionLabel } from '../../lib/options'
import { useForm } from '../../lib/useForm'

const INVALIDATE = ['/expenses/', '/reports/']
const FIELDS = [
  'property',
  'category',
  'vendor',
  'description',
  'amount',
  'paid_on',
  'mode',
  'reference',
]

/** Shades of the brand for the parts of one whole (how rent came in). */
const MODE_SHADES = [
  'bg-primary',
  'bg-[oklch(0.6_0.09_178)]',
  'bg-[oklch(0.72_0.075_178)]',
  'bg-[oklch(0.82_0.05_178)]',
  'bg-[oklch(0.9_0.03_178)]',
]

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

function ExpenseForm({
  formId,
  properties,
  busyChange,
  onDone,
}: {
  formId: string
  properties: Property[]
  busyChange: (busy: boolean) => void
  onDone: () => void
}) {
  const form = useForm({
    property: '',
    category: 'electricity',
    vendor: '',
    description: '',
    amount: '',
    paid_on: todayISO(),
    mode: 'upi',
    reference: '',
  })
  const save = useApiMutation(
    (body: Record<string, unknown>) => api.post<Expense>('/expenses/', body),
    INVALIDATE,
    () => {
      toast.success('Expense added')
      onDone()
    },
  )
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = rupeesToPaise(form.values.amount)
    if (amount === null) {
      form.setError(new Error('Amount: enter rupees, e.g. 2450.'))
      return
    }
    busyChange(true)
    save.mutate(
      { ...form.values, amount, property: form.values.property || null },
      {
        onError: form.setError,
        onSettled: () => busyChange(false),
      },
    )
  }
  return (
    <form id={formId} onSubmit={onSubmit} noValidate>
      <ErrorBanner error={form.error} fields={FIELDS} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Amount (₹)"
          inputMode="decimal"
          required
          placeholder="0"
          className="text-[15px] font-medium tabular-nums"
          error={form.fieldError('amount')}
          {...form.bind('amount')}
        />
        <TextField
          label="Paid on"
          type="date"
          max={todayISO()}
          error={form.fieldError('paid_on')}
          {...form.bind('paid_on')}
        />
        <SelectField label="Category" options={EXPENSE_CATEGORIES} {...form.bind('category')} />
        <SelectField
          label="Property"
          placeholder="All properties / head office"
          options={properties.map((p) => ({ value: p.id, label: p.name }))}
          error={form.fieldError('property')}
          {...form.bind('property')}
        />
        <TextField
          label="Paid to"
          placeholder="e.g. BESCOM"
          error={form.fieldError('vendor')}
          {...form.bind('vendor')}
        />
        <SelectField label="Paid by" options={PAYMENT_MODES} {...form.bind('mode')} />
        <div className="sm:col-span-2">
          <TextField
            label="Note"
            placeholder="e.g. October bill, 2nd floor"
            error={form.fieldError('description')}
            {...form.bind('description')}
          />
        </div>
        <div className="sm:col-span-2">
          <TextField
            label="Reference / bill no."
            hint="Optional. Helps you match the bill later."
            error={form.fieldError('reference')}
            {...form.bind('reference')}
          />
        </div>
      </div>
    </form>
  )
}

/** "₹2,16,333.34" with the paise drawn smaller, so big numbers fit on a phone. */
function Money({ paise }: { paise: number }) {
  const [whole, fraction] = formatMoney(paise).split('.')
  return (
    <>
      <span>{whole}</span>
      {fraction && <span className="text-[0.62em] font-medium opacity-70">.{fraction}</span>}
    </>
  )
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  tone?: 'good' | 'bad'
}) {
  return (
    // `stat` / `stat-value` are hooks for the end-to-end journey test, not styling.
    <div className="stat rounded-xl border bg-card p-4 shadow-xs transition-shadow duration-200 hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-[13px] font-medium text-muted-foreground">{label}</p>
        <span
          aria-hidden
          className={cn(
            'flex size-7 items-center justify-center rounded-md [&_svg]:size-3.5',
            tone === 'good'
              ? 'bg-emerald-50 text-emerald-600'
              : tone === 'bad'
                ? 'bg-red-50 text-red-600'
                : 'bg-secondary text-muted-foreground',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'stat-value m-0 mt-3 truncate text-[22px] leading-none sm:text-[26px] font-semibold tracking-[-0.025em] tabular-nums',
          tone === 'good' && 'text-emerald-700',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </p>
      {hint && <p className="m-0 mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="grid gap-5" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[106px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <Skeleton className="h-[260px] rounded-xl lg:col-span-3" />
        <Skeleton className="h-[260px] rounded-xl lg:col-span-2" />
      </div>
    </div>
  )
}

function CategoryBreakdown({ summary }: { summary: FinanceSummary }) {
  const rows = [...summary.expenses_by_category].sort((a, b) => b.total - a.total)
  const max = Math.max(0, ...rows.map((c) => c.total))
  return (
    <ul className="grid gap-3.5">
      {rows.map((c, i) => (
        <li key={c.category} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-foreground">{c.label}</span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="text-xs text-muted-foreground">
                {pct(c.total, summary.expenses)}%
              </span>
              <span className="font-semibold">{formatMoney(c.total)}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-700 ease-out',
                i === 0 ? 'bg-[oklch(0.42_0.03_230)]' : 'bg-[oklch(0.68_0.025_230)]',
              )}
              style={{ width: `${max > 0 ? Math.max(2, (c.total / max) * 100) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ModeBreakdown({ summary }: { summary: FinanceSummary }) {
  const rows = Object.entries(summary.income_by_mode).sort((a, b) => b[1] - a[1])
  return (
    <div className="grid gap-4">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
        {rows.map(([mode, total], i) => (
          <div
            key={mode}
            className={cn(
              'h-full transition-[width] duration-700 ease-out',
              MODE_SHADES[i % MODE_SHADES.length],
            )}
            style={{ width: `${summary.income > 0 ? (total / summary.income) * 100 : 0}%` }}
          />
        ))}
      </div>
      <ul className="grid gap-2.5">
        {rows.map(([mode, total], i) => (
          <li key={mode} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span
                className={cn('size-2 shrink-0 rounded-[3px]', MODE_SHADES[i % MODE_SHADES.length])}
                aria-hidden
              />
              <span className="truncate">{optionLabel(PAYMENT_MODES, mode)}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="text-xs text-muted-foreground">{pct(total, summary.income)}%</span>
              <span className="font-semibold text-foreground">{formatMoney(total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Of every ₹100 of rent collected, how much went on costs and how much was kept. */
function ProfitSplit({ summary }: { summary: FinanceSummary }) {
  const spent = Math.round((summary.expenses / summary.income) * 100)
  const kept = Math.max(0, 100 - spent)
  return (
    <div className="mt-5 border-t pt-4">
      <p className="m-0 text-[13px] font-medium">Of every ₹100 collected</p>
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div
          className={cn(
            'h-full transition-[width] duration-700 ease-out',
            spent > 100 ? 'bg-red-500' : 'bg-[oklch(0.68_0.025_230)]',
          )}
          style={{ width: `${Math.min(100, spent)}%` }}
        />
        {kept > 0 && (
          <div
            className="h-full bg-emerald-500 transition-[width] duration-700 ease-out"
            style={{ width: `${kept}%` }}
          />
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Spent on running costs</dt>
          <dd className="m-0 mt-1 text-[15px] font-semibold tabular-nums">₹{spent}</dd>
        </div>
        <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Kept as profit</dt>
          <dd
            className={cn(
              'm-0 mt-1 text-[15px] font-semibold tabular-nums',
              kept > 0 ? 'text-emerald-700' : 'text-destructive',
            )}
          >
            ₹{100 - spent}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function ExpenseMenu({ expense, onDelete }: { expense: Expense; onDelete: () => void }) {
  if (expense.category === 'salary') return null
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${expense.vendor || expense.category_label}`}
        >
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<Trash2 />} destructive onSelect={onDelete}>
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function ExpensesSkeleton() {
  return (
    <div className="grid gap-2 px-5 pb-5" role="status" aria-label="Loading">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-11" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  )
}

export function FinancePage() {
  const [period, setPeriod] = useState(currentPeriod())
  const [property, setProperty] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [downloadError, setDownloadError] = useState<unknown>(null)
  const properties = useList<Property>('/properties/')
  const summary = useApi<FinanceSummary>('/reports/finance', { period, property })
  const expenses = useList<Expense>('/expenses/', { period, property })
  const remove = useApiMutation((id: string) => api.delete(`/expenses/${id}/`), INVALIDATE)
  const s = summary.data
  const month = formatMonth(period)
  const margin = s && s.income > 0 ? Math.round((s.net / s.income) * 100) : null
  const expensesTotal = expenses.rows.reduce((sum, x) => sum + x.amount, 0)

  return (
    <>
      <PageHeader
        title="Expenses & profit"
        description="Rent collected minus what the PGs cost to run."
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <div className="col-span-2 sm:col-span-1 [&>span]:flex [&>span]:w-full [&>span>span]:flex-1 sm:[&>span]:inline-flex">
              <PeriodSwitcher period={period} onChange={setPeriod} />
            </div>
            <NativeSelect
              aria-label="Property"
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              className="col-span-2 sm:w-auto sm:min-w-40"
            >
              <option value="">All properties</option>
              {properties.rows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              aria-label={`Download ${month} (CSV)`}
              onClick={() =>
                download('/reports/monthly.csv', { period }, `pg-accounts-${period}.csv`).catch(
                  setDownloadError,
                )
              }
            >
              <Download />
              <span className="sm:hidden">Download CSV</span>
              <span className="hidden sm:inline">Download {month} (CSV)</span>
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus />
              Add expense
            </Button>
          </div>
        }
      />
      <ErrorBanner error={summary.error ?? downloadError ?? remove.error} />

      <div className="grid gap-5">
        {summary.isLoading || !s ? (
          <SummarySkeleton />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi
                label="Rent collected"
                value={<Money paise={s.income} />}
                hint={`Payments received in ${month}`}
                icon={<ArrowDownRight />}
                tone="good"
              />
              <Kpi
                label="Expenses"
                value={<Money paise={s.expenses} />}
                hint={
                  s.expenses_by_category.length
                    ? `Across ${s.expenses_by_category.length} ${s.expenses_by_category.length === 1 ? 'category' : 'categories'}`
                    : 'Nothing spent yet'
                }
                icon={<ArrowUpRight />}
              />
              <Kpi
                label={s.net >= 0 ? 'Profit' : 'Loss'}
                value={<Money paise={s.net} />}
                hint="Rent collected minus expenses"
                icon={<Wallet />}
                tone={s.net >= 0 ? 'good' : 'bad'}
              />
              <Kpi
                label="Margin"
                value={margin === null ? '—' : `${margin}%`}
                hint={margin === null ? 'No rent collected yet' : 'Of rent kept after costs'}
                icon={<Percent />}
                tone={margin === null ? undefined : margin >= 0 ? 'good' : 'bad'}
              />
            </div>

            {s.salaries_due.length > 0 && (
              <Alert
                tone="warn"
                className="items-center [&>svg]:mt-0"
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/app/staff" className="no-underline">
                      Pay staff
                    </Link>
                  </Button>
                }
              >
                {s.salaries_due.length} salar{s.salaries_due.length === 1 ? 'y' : 'ies'} not paid
                yet for {month}.
              </Alert>
            )}

            <div className="grid gap-5 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader
                  title="Where the money went"
                  description={`Expenses by category, ${month}`}
                />
                <CardContent>
                  {s.expenses_by_category.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
                      No expenses recorded for {month}.
                    </p>
                  ) : (
                    <CategoryBreakdown summary={s} />
                  )}
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader title="How rent came in" description="Rent collected by payment mode" />
                <CardContent>
                  {Object.keys(s.income_by_mode).length === 0 ? (
                    <p className="rounded-lg border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
                      No rent collected in {month}.
                    </p>
                  ) : (
                    <ModeBreakdown summary={s} />
                  )}
                  {s.income > 0 && <ProfitSplit summary={s} />}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        <Card>
          <CardHeader
            title={`Expenses in ${month}`}
            description={
              expenses.rows.length > 0
                ? `${expenses.rows.length} ${expenses.rows.length === 1 ? 'entry' : 'entries'} · ${formatMoney(expensesTotal)} in total`
                : 'Bills, supplies, repairs and salaries paid this month'
            }
          />
          {expenses.isLoading ? (
            <ExpensesSkeleton />
          ) : expenses.rows.length === 0 ? (
            <CardContent>
              <EmptyState
                icon={<Receipt />}
                title="No expenses yet."
                className="py-10"
                actions={
                  <Button variant="outline" onClick={() => setAdding(true)}>
                    <Plus />
                    Add your first expense
                  </Button>
                }
              >
                Add electricity bills, groceries, repairs and other costs to see your real profit.
              </EmptyState>
            </CardContent>
          ) : (
            <>
              <div className="hidden border-t md:block">
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Category</TH>
                      <TH>Details</TH>
                      <TH>Property</TH>
                      <TH className="text-right">Amount</TH>
                      <TH className="w-12">
                        <span className="sr-only">Actions</span>
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {expenses.rows.map((x) => (
                      <TR key={x.id}>
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {formatDate(x.paid_on)}
                        </TD>
                        <TD>
                          <Badge tone={x.category === 'salary' ? 'info' : 'neutral'}>
                            {x.category_label}
                          </Badge>
                        </TD>
                        <TD className="max-w-[280px]">
                          <div className="truncate font-medium">
                            {x.employee_name || x.vendor || '—'}
                          </div>
                          {x.description && (
                            <div className="truncate text-xs text-muted-foreground">
                              {x.description}
                            </div>
                          )}
                        </TD>
                        <TD className="text-muted-foreground">{x.property_name || 'All'}</TD>
                        <TD className="text-right font-semibold whitespace-nowrap">
                          {formatMoney(x.amount)}
                        </TD>
                        <TD className="text-right">
                          <ExpenseMenu expense={x} onDelete={() => remove.mutate(x.id)} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
              <ul className="border-t md:hidden">
                {expenses.rows.map((x) => (
                  <li
                    key={x.id}
                    className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0"
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
                      aria-hidden
                    >
                      {x.category === 'salary' ? (
                        <IndianRupee className="size-4" />
                      ) : (
                        <Receipt className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[13.5px] font-medium">
                        {x.employee_name || x.vendor || x.category_label}
                      </p>
                      <p className="m-0 truncate text-xs text-muted-foreground">
                        {x.category_label} · {formatDate(x.paid_on)}
                        {x.property_name && ` · ${x.property_name}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13.5px] font-semibold tabular-nums">
                      {formatMoney(x.amount)}
                    </span>
                    <span className="-mr-2 w-8 shrink-0">
                      <ExpenseMenu expense={x} onDelete={() => remove.mutate(x.id)} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="Add expense"
        description={`Recorded against ${month} by the date it was paid.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" form="expense-form" busy={saving}>
              Add expense
            </Button>
          </>
        }
      >
        {adding && (
          <ExpenseForm
            formId="expense-form"
            properties={properties.rows}
            busyChange={setSaving}
            onDone={() => setAdding(false)}
          />
        )}
      </Dialog>
    </>
  )
}
