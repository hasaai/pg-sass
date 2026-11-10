import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CircleCheck,
  IndianRupee,
  Phone,
  Plus,
  ReceiptText,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import type { Invoice, Payment } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { ErrorBanner, SelectField, TextField } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { cn } from '../../lib/cn'
import {
  formatDate,
  formatMoney,
  formatMonth,
  paiseToRupeesInput,
  rupeesToPaise,
  titleCase,
  todayISO,
} from '../../lib/format'
import { CHARGE_KINDS, PAYMENT_MODES, optionLabel } from '../../lib/options'
import { useForm } from '../../lib/useForm'

const INVALIDATE = ['/invoices/', '/payments/', '/reports/']

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Plain-word status of an invoice, as owners say it. */
function invoiceStatus(inv: Invoice): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  if (inv.is_overdue) return { label: 'Overdue', tone: 'bad' }
  if (inv.status === 'paid') return { label: 'Paid', tone: 'good' }
  if (inv.status === 'partially_paid') return { label: 'Partly paid', tone: 'warn' }
  if (inv.status === 'void') return { label: 'Void', tone: 'neutral' }
  return { label: 'Unpaid', tone: 'warn' }
}

/** Buttons at the bottom of a dialog form: Cancel on the left of the main action. */
function FormFooter({ onCancel, children }: { onCancel: () => void; children: ReactNode }) {
  return (
    <div className="-mx-6 mt-2 -mb-5 flex flex-wrap justify-end gap-2 border-t px-6 py-3.5">
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      {children}
    </div>
  )
}

function PaymentForm({
  invoice,
  onDone,
  onCancel,
}: {
  invoice: Invoice
  onDone: (p: Payment) => void
  onCancel: () => void
}) {
  const form = useForm({
    amount: paiseToRupeesInput(invoice.balance),
    mode: 'upi',
    reference: '',
    received_on: todayISO(),
  })
  // One key per form: a double click or a retry after a timeout records the payment once.
  const key = useRef(newKey())
  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      api.post<Payment>('/payments/', body, { 'Idempotency-Key': key.current }),
    INVALIDATE,
    onDone,
  )
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = rupeesToPaise(String(form.values.amount))
    if (!amount) return form.setError(new Error('Enter the amount received in rupees.'))
    save.mutate({ ...form.values, amount, invoice: invoice.id }, { onError: form.setError })
  }
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <ErrorBanner error={form.error} fields={['amount', 'mode', 'reference', 'received_on']} />
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-secondary/50 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium">{invoice.details.tenant_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {invoice.number} · {formatMonth(invoice.period)}
          </p>
        </div>
        <p className="shrink-0 text-right text-[13px] text-muted-foreground">
          Balance due{' '}
          <span className="block text-[17px] font-semibold text-foreground tabular-nums">
            {formatMoney(invoice.balance)}
          </span>
        </p>
      </div>
      <TextField
        label="Amount received (₹)"
        inputMode="decimal"
        error={form.fieldError('amount')}
        className="text-[15px] font-medium tabular-nums"
        {...form.bind('amount')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Paid by" options={PAYMENT_MODES} {...form.bind('mode')} />
        <TextField
          label="Received on"
          type="date"
          error={form.fieldError('received_on')}
          {...form.bind('received_on')}
        />
      </div>
      <TextField
        label="Reference (UPI ref / UTR / cheque no.)"
        error={form.fieldError('reference')}
        {...form.bind('reference')}
      />
      <FormFooter onCancel={onCancel}>
        <Button type="submit" busy={save.isPending}>
          Record payment
        </Button>
      </FormFooter>
    </form>
  )
}

function ChargeForm({
  invoice,
  onDone,
  onCancel,
}: {
  invoice: Invoice
  onDone: () => void
  onCancel: () => void
}) {
  const form = useForm({ kind: 'electricity', description: '', amount: '' })
  const save = useApiMutation(
    (b: Record<string, unknown>) => api.post(`/invoices/${invoice.id}/charges/`, b),
    INVALIDATE,
    onDone,
  )
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const amount = rupeesToPaise(String(form.values.amount))
        if (!amount) return form.setError(new Error('Enter the charge in rupees.'))
        save.mutate({ ...form.values, amount }, { onError: form.setError })
      }}
    >
      <ErrorBanner error={form.error} fields={['kind', 'description', 'amount']} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" options={CHARGE_KINDS} {...form.bind('kind')} />
        <TextField
          label="Amount (₹)"
          inputMode="decimal"
          error={form.fieldError('amount')}
          className="tabular-nums"
          {...form.bind('amount')}
        />
      </div>
      <TextField
        label="Description"
        required
        placeholder="e.g. Electricity 112 units"
        error={form.fieldError('description')}
        {...form.bind('description')}
      />
      <FormFooter onCancel={onCancel}>
        <Button type="submit" busy={save.isPending}>
          Add charge
        </Button>
      </FormFooter>
    </form>
  )
}

function VoidForm({
  invoice,
  onDone,
  onCancel,
}: {
  invoice: Invoice
  onDone: () => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const save = useApiMutation(
    (b: Record<string, unknown>) => api.post(`/invoices/${invoice.id}/void/`, b),
    INVALIDATE,
    onDone,
  )
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate({ reason })
      }}
    >
      <ErrorBanner error={save.error} fields={[]} />
      <Alert tone="warn">
        Voiding cancels this invoice. You can then generate a new one for the month.
      </Alert>
      <TextField
        label="Reason"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <FormFooter onCancel={onCancel}>
        <Button type="submit" variant="destructive" busy={save.isPending} disabled={!reason.trim()}>
          Void invoice
        </Button>
      </FormFooter>
    </form>
  )
}

function InvoiceSkeleton() {
  return (
    <div className="grid gap-5" role="status" aria-label="Loading">
      <Skeleton className="h-4 w-36" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-[460px] lg:col-span-2" />
        <div className="grid content-start gap-5">
          <Skeleton className="h-[220px]" />
          <Skeleton className="h-[160px]" />
        </div>
      </div>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-medium tracking-[0.04em] text-subtle-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[13.5px] text-foreground tabular-nums">{children}</dd>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-[13.5px]', className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

export function InvoiceDetailPage() {
  const { id = '' } = useParams()
  const [dialog, setDialog] = useState<null | 'pay' | 'charge' | 'void'>(null)
  const [lastReceipt, setLastReceipt] = useState<Payment | null>(null)
  const { data: inv, isLoading, error } = useApi<Invoice>(`/invoices/${id}/`)
  const org = useAuth().membership?.organization
  if (isLoading) return <InvoiceSkeleton />
  if (error || !inv) return <ErrorBanner error={error ?? 'Not found'} />
  const close = () => setDialog(null)
  const onOpenChange = (o: boolean) => {
    if (!o) close()
  }
  const open = inv.status !== 'void'
  const st = invoiceStatus(inv)
  const paidPct = inv.total > 0 ? Math.min(100, Math.round((inv.paid / inv.total) * 100)) : 0

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            to="/app/billing"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground no-underline hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Rent &amp; payments
          </Link>
        }
        title={`Invoice ${inv.number}`}
        description={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
            <span>
              {formatMonth(inv.period)} · {inv.details.tenant_name}
            </span>
          </span>
        }
        actions={
          open && (
            <>
              {inv.paid === 0 && (
                <Button variant="ghost" onClick={() => setDialog('void')}>
                  <Ban /> Void
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialog('charge')}>
                <Plus /> Add charge
              </Button>
              {inv.balance > 0 && (
                <Button onClick={() => setDialog('pay')}>
                  <IndianRupee /> Record payment
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid gap-5">
        {lastReceipt && (
          <Alert tone="good">
            Payment recorded.{' '}
            <Link
              to={`/app/billing/payments/${lastReceipt.id}/receipt`}
              className="font-medium text-emerald-800 underline-offset-2 hover:underline"
            >
              Open receipt {lastReceipt.receipt_number}
            </Link>
          </Alert>
        )}
        {inv.void_reason && (
          <Alert tone="info" title="This invoice was voided">
            Void reason: {inv.void_reason}
          </Alert>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {/* The invoice, laid out like the printed bill */}
          <Card className="overflow-hidden lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-6 pb-5 sm:px-8">
              <div className="flex min-w-0 items-center gap-3">
                {org?.logo_url ? (
                  <img
                    src={org.logo_url}
                    alt=""
                    width={44}
                    height={44}
                    className="size-11 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-accent-foreground">
                    <ReceiptText className="size-5" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{org?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {inv.details.property_name}
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[11.5px] font-medium tracking-[0.08em] text-subtle-foreground uppercase">
                  Rent invoice
                </p>
                <p className="mt-0.5 font-mono text-[13.5px] font-medium">{inv.number}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y bg-secondary/35 px-5 py-5 sm:grid-cols-4 sm:px-8">
              <div className="col-span-2 min-w-0">
                <dt className="text-[11.5px] font-medium tracking-[0.04em] text-subtle-foreground uppercase">
                  Billed to
                </dt>
                <dd className="mt-1 text-[13.5px]">
                  <Link
                    to={`/app/tenants/${inv.details.tenant_id}`}
                    className="font-medium text-primary no-underline hover:underline"
                  >
                    {inv.details.tenant_name}
                  </Link>
                  <span className="mt-0.5 flex items-center gap-1 text-muted-foreground tabular-nums">
                    <Phone className="size-3" aria-hidden /> {inv.details.tenant_phone}
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {inv.details.property_name} · {inv.details.place_label}
                  </span>
                </dd>
              </div>
              <Meta label="Issued">{formatDate(inv.issue_date)}</Meta>
              <Meta label="Due">
                <span className={cn(inv.is_overdue && 'font-medium text-destructive')}>
                  {formatDate(inv.due_date)}
                </span>
              </Meta>
            </dl>

            <div className="px-5 py-2 sm:px-8">
              <table data-slot="table" className="w-full border-collapse text-[13.5px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-3 text-left text-xs font-medium text-muted-foreground">
                      Item
                    </th>
                    <th className="py-3 text-right text-xs font-medium text-muted-foreground">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id} className="border-b border-dashed last:border-solid">
                      <td className="py-3 pr-4 align-top">
                        <p className="font-medium">{l.description}</p>
                        <p className="text-xs text-muted-foreground">{titleCase(l.kind)}</p>
                      </td>
                      <td className="py-3 text-right align-top font-medium whitespace-nowrap tabular-nums">
                        {formatMoney(l.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="ml-auto grid max-w-xs gap-2 py-4">
                <SummaryRow label="Total" value={formatMoney(inv.total)} />
                <SummaryRow
                  label="Paid"
                  value={inv.paid ? `− ${formatMoney(inv.paid)}` : formatMoney(0)}
                  className="[&_dd]:text-emerald-700"
                />
                <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-3">
                  <dt className="text-[13.5px] font-semibold">Balance due</dt>
                  <dd
                    className={cn(
                      'text-[20px] font-semibold tracking-[-0.02em] tabular-nums',
                      inv.balance > 0 && inv.is_overdue && 'text-destructive',
                    )}
                  >
                    {formatMoney(inv.balance)}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>

          <div className="grid content-start gap-5">
            <Card aria-label="Summary">
              <CardHeader
                title="Summary"
                actions={
                  <Badge tone={st.tone} dot>
                    {st.label}
                  </Badge>
                }
              />
              <CardContent>
                <p className="text-[13px] text-muted-foreground">Balance</p>
                <p className="mt-1 text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
                  {formatMoney(inv.balance)}
                </p>
                <div
                  className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"
                  role="meter"
                  aria-label="Paid so far"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={paidPct}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[oklch(0.55_0.1_175)] to-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${paidPct}%` }}
                  />
                </div>
                <dl className="mt-4 grid gap-2">
                  <SummaryRow label="Total" value={formatMoney(inv.total)} />
                  <SummaryRow label="Paid" value={formatMoney(inv.paid)} />
                  <SummaryRow
                    label="Due"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 text-subtle-foreground" />
                        {formatDate(inv.due_date)}
                      </span>
                    }
                  />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader
                title="Payments"
                description={
                  inv.payments.length
                    ? `${inv.payments.length} received`
                    : 'Payments show here with their receipts'
                }
              />
              {inv.payments.length === 0 ? (
                <CardContent>
                  <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">
                    No payments yet.
                  </p>
                </CardContent>
              ) : (
                <ul className="border-t">
                  {inv.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <CircleCheck className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/app/billing/payments/${p.id}/receipt`}
                          className="font-mono text-[12.5px] font-medium text-primary no-underline hover:underline"
                        >
                          {p.receipt_number}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(p.received_on)} · {optionLabel(PAYMENT_MODES, p.mode)}
                          {p.reference ? ` · ${p.reference}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-[13.5px] font-semibold tabular-nums">
                        {formatMoney(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Dialog
        open={dialog === 'pay'}
        onOpenChange={onOpenChange}
        title="Record payment"
        description="The tenant gets a receipt with a number for this payment."
      >
        <PaymentForm
          invoice={inv}
          onCancel={close}
          onDone={(p) => {
            setLastReceipt(p)
            close()
          }}
        />
      </Dialog>
      <Dialog
        open={dialog === 'charge'}
        onOpenChange={onOpenChange}
        title="Add charge"
        description={`Adds a line to ${inv.number} and raises the balance.`}
      >
        <ChargeForm invoice={inv} onDone={close} onCancel={close} />
      </Dialog>
      <Dialog open={dialog === 'void'} onOpenChange={onOpenChange} title="Void invoice">
        <VoidForm invoice={inv} onDone={close} onCancel={close} />
      </Dialog>
    </>
  )
}
