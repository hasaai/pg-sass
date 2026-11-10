import { Banknote, CreditCard, Download, Landmark, Receipt, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { FilterChips, Money, PropertyPicker, SearchBox, Toolbar } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { EmptyState, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { NativeSelect } from '../../components/ui-kit/input'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { PAY_MODE } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { PayMode } from '../../data/types'
import { formatDate, formatMoney, shiftPeriod } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { NoAccessGuard } from './guards'
import { LAST_MONTH, THIS_MONTH, csvRupees, downloadCsv } from './lib'
import { ReceiptDialog } from './money-dialogs'

type Range = 'this' | 'last' | 'three'
const RANGE_LABEL: Record<Range, string> = {
  this: 'This month',
  last: 'Last month',
  three: 'Last 3 months',
}
const MODE_ICON: Record<PayMode, ReactNode> = {
  upi: <Smartphone />,
  cash: <Banknote />,
  bank: <Landmark />,
  card: <CreditCard />,
}

export function PaymentsPage() {
  return (
    <NoAccessGuard perm="rent.view" what="payments and receipts">
      <Payments />
    </NoAccessGuard>
  )
}

function inRange(paidOn: string, range: Range) {
  const p = paidOn.slice(0, 7)
  if (range === 'this') return p === THIS_MONTH
  if (range === 'last') return p === LAST_MONTH
  return p >= shiftPeriod(THIS_MONTH, -2) && p <= THIS_MONTH
}

function Payments() {
  useBreadcrumbs([{ label: 'Payments & receipts' }])
  const payments = useDb((db) => db.payments)
  const tenants = useDb((db) => db.tenants)
  const properties = useDb((db) => db.properties)
  const [range, setRange] = useState<Range>('this')
  const [mode, setMode] = useState<'' | PayMode>('')
  const [propertyId, setPropertyId] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const nameOf = useMemo(() => new Map(tenants.map((t) => [t.id, t.name])), [tenants])

  const scoped = payments.filter(
    (p) => (!propertyId || p.propertyId === propertyId) && inRange(p.paidOn, range),
  )
  const byMode = (m: PayMode) =>
    scoped.filter((p) => p.mode === m).reduce((s, p) => s + p.amount, 0)
  const total = scoped.reduce((s, p) => s + p.amount, 0)
  const needle = q.trim().toLowerCase()
  const rows = scoped
    .filter((p) => !mode || p.mode === mode)
    .filter(
      (p) =>
        !needle ||
        p.receipt.toLowerCase().includes(needle) ||
        (nameOf.get(p.tenantId) ?? '').toLowerCase().includes(needle) ||
        p.reference.toLowerCase().includes(needle),
    )
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.receipt.localeCompare(a.receipt))
  const rowsTotal = rows.reduce((s, p) => s + p.amount, 0)

  function exportCsv() {
    downloadCsv(`payments-${RANGE_LABEL[range].toLowerCase().replace(/ /g, '-')}.csv`, [
      [
        'Receipt',
        'Date',
        'Tenant',
        'Property',
        'Amount (₹)',
        'Paid by',
        'Reference',
        'Collected by',
      ],
      ...rows.map((p) => [
        p.receipt,
        p.paidOn,
        nameOf.get(p.tenantId) ?? '',
        properties.find((x) => x.id === p.propertyId)?.name ?? '',
        csvRupees(p.amount),
        PAY_MODE[p.mode],
        p.reference,
        p.collectedBy,
      ]),
    ])
    toast.success(`Downloaded ${rows.length} payments as a spreadsheet`)
  }

  return (
    <div>
      <PageHeader
        title="Payments & receipts"
        description="Every rupee received, with its receipt."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download /> Export CSV
          </Button>
        }
      />
      <div className="mb-5">
        <FilterChips
          label="Date range"
          value={range}
          onChange={setRange}
          options={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({
            value: r,
            label: RANGE_LABEL[r],
          }))}
        />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Total received"
          value={formatMoney(total)}
          hint={`${scoped.length} payments`}
          icon={<Receipt />}
        />
        {(['upi', 'cash', 'bank', 'card'] as PayMode[]).map((m) => (
          <StatCard
            key={m}
            label={PAY_MODE[m]}
            value={formatMoney(byMode(m))}
            icon={MODE_ICON[m]}
            hint={total ? `${Math.round((byMode(m) / total) * 100)}% of the total` : '—'}
          />
        ))}
      </div>

      <Toolbar>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search receipt, tenant or UTR"
          className="max-w-sm"
        />
        <NativeSelect
          aria-label="Paid by"
          value={mode}
          onChange={(e) => setMode(e.target.value as '' | PayMode)}
          className="h-9 w-auto min-w-36"
        >
          <option value="">All modes</option>
          {(Object.keys(PAY_MODE) as PayMode[]).map((m) => (
            <option key={m} value={m}>
              {PAY_MODE[m]}
            </option>
          ))}
        </NativeSelect>
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="No payments here"
          actions={
            <Button
              variant="outline"
              onClick={() => {
                setQ('')
                setMode('')
                setPropertyId('')
                setRange('three')
              }}
            >
              Show last 3 months
            </Button>
          }
        >
          Try another date range, mode or property.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Table>
            <THead>
              <tr>
                <TH>Receipt</TH>
                <TH>Date</TH>
                <TH>Tenant</TH>
                <TH>Property</TH>
                <TH className="text-right">Amount</TH>
                <TH>Paid by</TH>
                <TH>Reference</TH>
                <TH>Collected by</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.id} className="cursor-pointer" onClick={() => setOpen(p.id)}>
                  <TD className="font-medium whitespace-nowrap text-primary">{p.receipt}</TD>
                  <TD className="whitespace-nowrap">{formatDate(p.paidOn)}</TD>
                  <TD className="font-medium whitespace-nowrap">{nameOf.get(p.tenantId) ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {properties.find((x) => x.id === p.propertyId)?.name ?? '—'}
                  </TD>
                  <TD className="text-right font-semibold">
                    <Money value={p.amount} />
                  </TD>
                  <TD>
                    <Badge tone="outline" className="[&_svg]:size-3">
                      {MODE_ICON[p.mode]} {PAY_MODE[p.mode]}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-xs text-muted-foreground">{p.reference || '—'}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{p.collectedBy}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="flex justify-between border-t bg-secondary/40 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">{rows.length} payments</span>
            <span className="font-semibold tabular-nums">{formatMoney(rowsTotal)}</span>
          </div>
        </div>
      )}
      {open && <ReceiptDialog paymentId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
