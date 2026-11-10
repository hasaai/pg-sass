/** Reports & profit: income, expenses, occupancy, collections and CSV downloads. */
import {
  BedDouble,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Percent,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Bars, FilterChips, Money, NoAccess, Section } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { Meter, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { THIS_MONTH } from '../../data/seed'
import {
  EXPENSE_CATEGORY,
  INVOICE_STATUS,
  PAY_MODE,
  TENANT_STATUS,
  balance,
  daysLate,
  occupancy,
  placeLabel,
} from '../../data/selectors'
import { useDb } from '../../data/store'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatMoney, formatMonth, plural } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { BarRow, KpiRow } from './shared'
import { csvRupees, downloadCsv, monthsBack, shortMonth } from './helpers'

type PeriodKey = 'this_month' | 'last_month' | 'last_3' | 'this_year'

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
]

function periodMonths(key: PeriodKey): string[] {
  if (key === 'this_month') return [THIS_MONTH]
  if (key === 'last_month') return monthsBack(THIS_MONTH, 2).slice(0, 1)
  if (key === 'last_3') return monthsBack(THIS_MONTH, 3)
  return monthsBack(THIS_MONTH, Number(THIS_MONTH.slice(5)))
}

/** ₹1.2L / ₹85K for chart labels. */
function shortMoney(paise: number) {
  const r = paise / 100
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`
  if (r >= 1000) return `₹${Math.round(r / 1000)}K`
  return `₹${Math.round(r)}`
}

export function ReportsPage() {
  useBreadcrumbs([{ label: 'Reports & profit' }])
  const { can } = useSession()
  const db = useDb((d) => d)
  const [key, setKey] = useState<PeriodKey>('this_month')
  const months = periodMonths(key)
  const inPeriod = (date: string) => months.includes(date.slice(0, 7))
  const label = PERIODS.find((p) => p.value === key)!.label
  const periodText =
    months.length === 1
      ? formatMonth(months[0]!)
      : `${formatMonth(months[0]!)} – ${formatMonth(months.at(-1)!)}`

  const openProps = db.properties.filter((p) => p.status !== 'archived')

  const summary = (() => {
    const rows = openProps.map((p) => {
      const income = db.payments
        .filter((x) => x.propertyId === p.id && inPeriod(x.paidOn))
        .reduce((s, x) => s + x.amount, 0)
      const spent = db.expenses
        .filter((x) => x.propertyId === p.id && inPeriod(x.date))
        .reduce((s, x) => s + x.amount, 0)
      return { p, income, spent, profit: income - spent }
    })
    const income = rows.reduce((s, r) => s + r.income, 0)
    const spent = rows.reduce((s, r) => s + r.spent, 0)
    return { rows, income, spent, profit: income - spent }
  })()

  const chart = monthsBack(THIS_MONTH, 4).map((m) => ({
    label: shortMonth(m),
    value: db.payments.filter((x) => x.paidOn.startsWith(m)).reduce((s, x) => s + x.amount, 0),
    secondary: db.expenses.filter((x) => x.date.startsWith(m)).reduce((s, x) => s + x.amount, 0),
  }))

  const activeBeds = db.beds.filter(
    (b) => db.properties.find((p) => p.id === b.propertyId)?.status === 'active',
  ).length
  const occTrend = monthsBack(THIS_MONTH, 4).map((m) => {
    const end = m === THIS_MONTH ? '2026-11-02' : `${m}-28`
    const staying = db.tenants.filter(
      (t) => t.checkIn <= end && (!t.moveOutOn || t.moveOutOn > end) && t.status !== 'upcoming',
    ).length
    return {
      label: shortMonth(m),
      value: activeBeds ? Math.round((staying / activeBeds) * 100) : 0,
    }
  })

  const bills = db.invoices.filter((i) => months.includes(i.period))
  const billed = bills.reduce((s, i) => s + i.total, 0)
  const collected = bills.reduce((s, i) => s + i.paid, 0)
  const rate = billed ? Math.round((collected / billed) * 100) : 0

  const topExpenses = (Object.keys(EXPENSE_CATEGORY) as (keyof typeof EXPENSE_CATEGORY)[])
    .map((c) => ({
      c,
      amount: db.expenses
        .filter((e) => e.category === c && inPeriod(e.date))
        .reduce((s, e) => s + e.amount, 0),
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  const late = db.invoices.filter((i) => balance(i) > 0 && daysLate(i) > 0)
  const ageing = [
    { label: '0–7 days', list: late.filter((i) => daysLate(i) <= 7), tone: 'bg-amber-400' },
    {
      label: '8–30 days',
      list: late.filter((i) => daysLate(i) > 7 && daysLate(i) <= 30),
      tone: 'bg-orange-500',
    },
    { label: 'More than 30 days', list: late.filter((i) => daysLate(i) > 30), tone: 'bg-red-600' },
  ].map((b) => ({ ...b, amount: b.list.reduce((s, i) => s + balance(i), 0) }))
  const lateTotal = ageing.reduce((s, b) => s + b.amount, 0)

  if (!can('reports.download')) return <NoAccess what="reports" />

  const propName = (id: string) => db.properties.find((p) => p.id === id)?.name ?? '—'
  const tenantName = (id: string) => db.tenants.find((t) => t.id === id)?.name ?? '—'

  const downloads: {
    key: string
    title: string
    description: string
    icon: ReactNode
    rows: () => (string | number)[][]
  }[] = [
    {
      key: 'rent-register',
      title: 'Rent register',
      description: 'Every rent bill with paid and balance',
      icon: <Receipt />,
      rows: () => [
        ['Bill', 'Tenant', 'Property', 'Month', 'Billed (₹)', 'Paid (₹)', 'Balance (₹)', 'Status'],
        ...bills.map((i) => [
          i.number,
          tenantName(i.tenantId),
          propName(i.propertyId),
          formatMonth(i.period),
          csvRupees(i.total),
          csvRupees(i.paid),
          csvRupees(balance(i)),
          INVOICE_STATUS[i.status].label,
        ]),
      ],
    },
    {
      key: 'collections',
      title: 'Collections',
      description: 'Payments received with mode and reference',
      icon: <IndianRupee />,
      rows: () => [
        [
          'Receipt',
          'Date',
          'Tenant',
          'Property',
          'Amount (₹)',
          'Mode',
          'Reference',
          'Collected by',
        ],
        ...db.payments
          .filter((x) => inPeriod(x.paidOn))
          .map((x) => [
            x.receipt,
            x.paidOn,
            tenantName(x.tenantId),
            propName(x.propertyId),
            csvRupees(x.amount),
            PAY_MODE[x.mode],
            x.reference,
            x.collectedBy,
          ]),
      ],
    },
    {
      key: 'expenses',
      title: 'Expenses',
      description: 'All spending by category and property',
      icon: <Wallet />,
      rows: () => [
        ['Date', 'Category', 'Description', 'Vendor', 'Property', 'Amount (₹)', 'Paid by', 'Bill'],
        ...db.expenses
          .filter((e) => inPeriod(e.date))
          .map((e) => [
            e.date,
            EXPENSE_CATEGORY[e.category],
            e.description,
            e.vendor,
            propName(e.propertyId),
            csvRupees(e.amount),
            PAY_MODE[e.mode],
            e.hasBill ? 'Yes' : 'No',
          ]),
      ],
    },
    {
      key: 'tenants',
      title: 'Tenant list',
      description: 'Everyone staying now, with room and rent',
      icon: <Users />,
      rows: () => [
        ['Name', 'Mobile', 'Property', 'Room / bed', 'Status', 'Rent (₹)', 'Moved in'],
        ...db.tenants
          .filter((t) => t.status !== 'moved_out')
          .map((t) => [
            t.name,
            t.phone,
            propName(t.propertyId),
            placeLabel(db, t),
            TENANT_STATUS[t.status].label,
            csvRupees(t.rent),
            t.checkIn,
          ]),
      ],
    },
    {
      key: 'gst',
      title: 'GST summary',
      description: 'Rent billed each month, exempt and taxable',
      icon: <Percent />,
      rows: () => [
        [
          'Month',
          'Total billed (₹)',
          'Exempt rent – up to ₹20,000 a bed (₹)',
          'Taxable (₹)',
          'GST at 12% (₹)',
        ],
        ...months.map((m) => {
          const list = db.invoices.filter((i) => i.period === m)
          const total = list.reduce((s, i) => s + i.total, 0)
          const taxable = list.reduce((s, i) => s + (i.total > 2000000 ? i.total : 0), 0)
          return [
            formatMonth(m),
            csvRupees(total),
            csvRupees(total - taxable),
            csvRupees(taxable),
            csvRupees(taxable * 0.12),
          ]
        }),
      ],
    },
    {
      key: 'occupancy',
      title: 'Occupancy',
      description: 'Beds filled, vacant and reserved per property',
      icon: <BedDouble />,
      rows: () => [
        ['Property', 'Beds', 'Filled', 'Vacant', 'Reserved', 'Filled %'],
        ...openProps.map((p) => {
          const o = occupancy(db, p.id)
          return [p.name, o.beds, o.filled, o.vacant, o.reserved, `${o.pct}%`]
        }),
      ],
    },
  ]

  const margin = summary.income ? Math.round((summary.profit / summary.income) * 100) : 0

  return (
    <>
      <PageHeader
        title="Reports & profit"
        description={`How your PGs are doing · ${periodText}`}
        actions={<FilterChips label="Period" value={key} onChange={setKey} options={PERIODS} />}
      />

      <KpiRow>
        <StatCard
          label="Income from rent"
          value={<Money value={summary.income} />}
          icon={<IndianRupee />}
          hint={`Payments received · ${label.toLowerCase()}`}
        />
        <StatCard
          label="Expenses"
          value={<Money value={summary.spent} />}
          icon={<Wallet />}
          hint="Bills, food, salaries, repairs"
        />
        <StatCard
          label="Profit"
          value={
            <Money
              value={summary.profit}
              className={summary.profit < 0 ? 'text-red-600' : 'text-emerald-700'}
            />
          }
          icon={<TrendingUp />}
          hint="Income minus expenses"
        />
        <StatCard
          label="Margin"
          value={`${margin}%`}
          icon={<Percent />}
          hint="Profit out of every ₹100 earned"
        />
      </KpiRow>

      <div className="grid gap-6">
        <Section title="Profit by property" description={periodText} bodyClassName="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Property</TH>
                <TH className="text-right">Income</TH>
                <TH className="text-right">Expenses</TH>
                <TH className="text-right">Profit</TH>
                <TH className="text-right">Margin</TH>
              </TR>
            </THead>
            <TBody>
              {summary.rows.map((r) => (
                <TR key={r.p.id}>
                  <TD className="font-medium whitespace-nowrap">{r.p.name}</TD>
                  <TD className="text-right">
                    <Money value={r.income} />
                  </TD>
                  <TD className="text-right">
                    <Money value={r.spent} />
                  </TD>
                  <TD className={cn('text-right font-medium', r.profit < 0 && 'text-red-600')}>
                    <Money value={r.profit} />
                  </TD>
                  <TD className="text-right text-muted-foreground">
                    {r.income ? `${Math.round((r.profit / r.income) * 100)}%` : '—'}
                  </TD>
                </TR>
              ))}
              <TR className="bg-secondary/40 font-semibold">
                <TD>Total</TD>
                <TD className="text-right">
                  <Money value={summary.income} />
                </TD>
                <TD className="text-right">
                  <Money value={summary.spent} />
                </TD>
                <TD className={cn('text-right', summary.profit < 0 && 'text-red-600')}>
                  <Money value={summary.profit} />
                </TD>
                <TD className="text-right">{margin}%</TD>
              </TR>
            </TBody>
          </Table>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            title="Income and expenses"
            description="Last 4 months"
            actions={
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary" /> Income
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-slate-300" /> Expenses
                </span>
              </span>
            }
          >
            <Bars data={chart} format={shortMoney} height={180} />
          </Section>
          <Section
            title="Beds filled"
            description="Share of beds with a tenant at the end of each month"
          >
            <Bars data={occTrend} format={(n) => `${n}%`} height={180} color="bg-emerald-500" />
            <p className="mt-3 text-xs text-muted-foreground">
              Now: {occTrend.at(-1)?.value}% of {activeBeds} beds in open properties.
            </p>
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Rent collected" description={`Bills for ${periodText}`}>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{rate}%</p>
            <div className="mt-3">
              <Meter value={collected} max={billed} label="Rent collected" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              <Money value={collected} className="font-medium text-foreground" /> of{' '}
              <Money value={billed} /> billed
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {bills.filter((b) => b.status === 'paid').length} of {bills.length} bills fully paid
            </p>
          </Section>

          <Section title="Top expenses" description={periodText} bodyClassName="grid gap-4">
            {topExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses in this period.</p>
            ) : (
              topExpenses.map((x) => (
                <BarRow
                  key={x.c}
                  label={EXPENSE_CATEGORY[x.c]}
                  value={x.amount}
                  max={topExpenses[0]!.amount}
                  display={formatMoney(x.amount)}
                />
              ))
            )}
          </Section>

          <Section
            title="Overdue rent by age"
            description={`${formatMoney(lateTotal)} pending from ${late.length} bills`}
            actions={
              <Button asChild variant="link" size="sm">
                <Link to="/app/rent">See bills</Link>
              </Button>
            }
            bodyClassName="grid gap-4"
          >
            {ageing.map((b) => (
              <BarRow
                key={b.label}
                label={
                  <span>
                    {b.label}{' '}
                    <span className="text-muted-foreground">· {plural(b.list.length, 'bill')}</span>
                  </span>
                }
                value={b.amount}
                max={Math.max(...ageing.map((x) => x.amount))}
                display={formatMoney(b.amount)}
                color={b.tone}
              />
            ))}
          </Section>
        </div>

        <Section
          title="Download reports"
          description={`CSV files open in Excel or Google Sheets · ${periodText}`}
          bodyClassName="p-0"
        >
          <ul className="divide-y">
            {downloads.map((d) => (
              <li key={d.key} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground [&_svg]:size-4">
                  {d.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.description}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const rows = d.rows()
                    downloadCsv(`${d.key}-${key.replace('_', '-')}.csv`, rows)
                    toast.success(`${d.title} downloaded (${rows.length - 1} rows)`)
                  }}
                >
                  <Download /> <span className="hidden sm:inline">Download</span> CSV
                </Button>
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-2 border-t px-5 py-3 text-xs text-muted-foreground">
            <FileSpreadsheet className="size-3.5" /> Amounts are in rupees. Each file uses the
            period chosen at the top.
          </p>
        </Section>
      </div>
    </>
  )
}
