import { CreditCard, Download, Mail, RotateCcw, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { FilterChips, SearchBox, Status, Toolbar } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { NativeSelect, Textarea } from '../../components/ui-kit/input'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { updateDb, useDb } from '../../data/store'
import type { PlatformPayment } from '../../data/types'
import { formatDate, formatMoney, formatMonth, plural } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { updateExtras, useExtras } from './extras'
import { GATEWAY, PAYMENT_STATUS, PERSON_SHORT, formatDateTime, stamp } from './util'

type StatusFilter = 'all' | PlatformPayment['status']

export function Payments() {
  useBreadcrumbs([{ label: 'Payments' }])
  const [params, setParams] = useSearchParams()
  const payments = useDb((db) => db.platformPayments)
  const businesses = useDb((db) => db.platformBusinesses)
  const plans = useExtras((x) => x.plans)
  const emails = useExtras((x) => x.emailsSent)
  const [refund, setRefund] = useState<PlatformPayment | null>(null)
  const [q, setQ] = useState('')
  const [gateway, setGateway] = useState('')
  const [month, setMonth] = useState('')
  const status = (params.get('status') ?? 'all') as StatusFilter

  const months = useMemo(
    () => [...new Set(payments.map((p) => p.paidOn.slice(0, 7)))].sort().reverse(),
    [payments],
  )

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return payments
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => !gateway || p.gateway === gateway)
      .filter((p) => !month || p.paidOn.startsWith(month))
      .filter(
        (p) =>
          !term ||
          p.business.toLowerCase().includes(term) ||
          p.reference.toLowerCase().includes(term),
      )
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || a.business.localeCompare(b.business))
  }, [payments, status, gateway, month, q])

  const sum = (list: PlatformPayment[], s: PlatformPayment['status']) =>
    list.filter((p) => p.status === s).reduce((t, p) => t + p.amount, 0)
  const failed = payments.filter((p) => p.status === 'failed')
  const planName = (code: string) => plans.find((p) => p.code === code)?.name ?? code
  const bizId = (name: string) => businesses.find((b) => b.name === name)?.id

  function retry(p: PlatformPayment) {
    updateDb((db) => {
      db.platformPayments = db.platformPayments.map((x) =>
        x.id === p.id ? { ...x, status: 'paid', paidOn: '2026-11-02' } : x,
      )
      db.platformBusinesses = db.platformBusinesses.map((b) =>
        b.name === p.business && b.planStatus === 'past_due' ? { ...b, planStatus: 'active' } : b,
      )
    })
    toast.success(`${formatMoney(p.amount)} collected from ${p.business}`, {
      description: `Charged again through ${GATEWAY[p.gateway]}.`,
    })
  }

  function email(p: PlatformPayment) {
    updateExtras((x) => {
      x.emailsSent[p.id] = stamp()
    })
    toast.success(`Payment link emailed to ${p.business}`, {
      description: 'The owner can pay by UPI, card or net banking.',
    })
  }

  function setStatus(v: StatusFilter) {
    const next = new URLSearchParams(params)
    if (v === 'all') next.delete('status')
    else next.set('status', v)
    setParams(next, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Plan payments"
        description="What businesses paid us for their PG Manager plan."
        actions={
          <Button
            variant="outline"
            onClick={() => toast.success(`${plural(rows.length, 'payment')} downloaded as CSV`)}
          >
            <Download /> Download
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Collected"
          value={formatMoney(sum(rows, 'paid'))}
          hint={`${rows.filter((p) => p.status === 'paid').length} payments in this view`}
        />
        <StatCard
          label="Refunded"
          value={formatMoney(sum(rows, 'refunded'))}
          hint={`${rows.filter((p) => p.status === 'refunded').length} refunds`}
        />
        <StatCard
          label="Failed"
          value={formatMoney(sum(rows, 'failed'))}
          hint={`${rows.filter((p) => p.status === 'failed').length} to follow up`}
        />
        <StatCard
          label="Average payment"
          value={formatMoney(
            Math.round(
              sum(rows, 'paid') / Math.max(1, rows.filter((p) => p.status === 'paid').length),
            ),
          )}
          hint={month ? formatMonth(month) : 'All months shown'}
        />
      </div>

      {failed.length > 0 && status !== 'failed' && (
        <Alert
          tone="bad"
          className="mb-5"
          title={`${plural(failed.length, 'payment')} failed`}
          actions={
            <Button size="sm" variant="outline" onClick={() => setStatus('failed')}>
              Show
            </Button>
          }
        >
          Charge again, or email the owner a payment link.
        </Alert>
      )}

      <Toolbar>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search business or payment reference"
          className="w-full sm:max-w-xs"
        />
        <NativeSelect
          aria-label="Gateway"
          value={gateway}
          onChange={(e) => setGateway(e.target.value)}
          className="w-auto min-w-36"
        >
          <option value="">All gateways</option>
          <option value="razorpay">Razorpay</option>
          <option value="cashfree">Cashfree</option>
        </NativeSelect>
        <NativeSelect
          aria-label="Month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-auto min-w-40"
        >
          <option value="">All months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </NativeSelect>
      </Toolbar>
      <div className="mb-4">
        <FilterChips<StatusFilter>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All', count: payments.length },
            {
              value: 'paid',
              label: 'Paid',
              count: payments.filter((p) => p.status === 'paid').length,
            },
            { value: 'failed', label: 'Failed', count: failed.length },
            {
              value: 'refunded',
              label: 'Refunded',
              count: payments.filter((p) => p.status === 'refunded').length,
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<CreditCard />} title="No payments match">
          Try another month, gateway or search.
        </EmptyState>
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <THead>
              <TR>
                <TH>Business</TH>
                <TH>Plan</TH>
                <TH className="text-right">Amount</TH>
                <TH>Gateway</TH>
                <TH>Status</TH>
                <TH>Date</TH>
                <TH>Reference</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => {
                const id = bizId(p.business)
                return (
                  <TR key={p.id}>
                    <TD className="font-medium whitespace-nowrap">
                      {id ? (
                        <Link
                          to={`/platform/businesses/${id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {p.business}
                        </Link>
                      ) : (
                        p.business
                      )}
                    </TD>
                    <TD>
                      <Badge tone="outline">{planName(p.plan)}</Badge>
                    </TD>
                    <TD className="text-right font-medium tabular-nums">{formatMoney(p.amount)}</TD>
                    <TD>{GATEWAY[p.gateway]}</TD>
                    <TD>
                      <Status of={PAYMENT_STATUS} value={p.status} />
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(p.paidOn)}</TD>
                    <TD className="font-mono text-xs text-muted-foreground">{p.reference}</TD>
                    <TD className="text-right whitespace-nowrap">
                      {p.status === 'paid' && (
                        <Button size="sm" variant="ghost" onClick={() => setRefund(p)}>
                          <Undo2 /> Refund
                        </Button>
                      )}
                      {p.status === 'failed' && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => retry(p)}>
                            <RotateCcw /> Charge again
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => email(p)}>
                            <Mail /> {emails[p.id] ? 'Email again' : 'Email link'}
                          </Button>
                        </div>
                      )}
                      {p.status === 'failed' && emails[p.id] && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Emailed {formatDateTime(emails[p.id] ?? '')}
                        </p>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            {plural(rows.length, 'payment')} · {formatMoney(rows.reduce((s, p) => s + p.amount, 0))}{' '}
            in total
          </p>
        </div>
      )}

      <RefundDialog
        payment={refund}
        onClose={() => setRefund(null)}
        planName={refund ? planName(refund.plan) : ''}
      />
    </>
  )
}

function RefundDialog({
  payment,
  onClose,
  planName,
}: {
  payment: PlatformPayment | null
  onClose: () => void
  planName: string
}) {
  const businesses = useDb((db) => db.platformBusinesses)
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const error = tried && !reason.trim() ? 'Write why the money is going back.' : undefined
  function close() {
    setReason('')
    setTried(false)
    onClose()
  }
  return (
    <Dialog
      open={Boolean(payment)}
      onOpenChange={(o) => !o && close()}
      title="Refund this payment?"
      description={
        payment ? `${payment.business} · ${planName} · ${formatDate(payment.paidOn)}` : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setTried(true)
              if (!payment || !reason.trim()) return
              updateDb((db) => {
                db.platformPayments = db.platformPayments.map((x) =>
                  x.id === payment.id ? { ...x, status: 'refunded' } : x,
                )
              })
              const biz = payment.business
              const id = businesses.find((b) => b.name === biz)?.id
              if (id) {
                updateExtras((x) => {
                  x.notes[id] = [
                    {
                      at: stamp(),
                      by: PERSON_SHORT,
                      text: `Refunded ${formatMoney(payment.amount)} (${payment.reference}): ${reason.trim()}`,
                    },
                    ...(x.notes[id] ?? []),
                  ]
                })
              }
              toast.success(`${formatMoney(payment.amount)} refunded to ${biz}`, {
                description: `${GATEWAY[payment.gateway]} returns it in 5–7 working days.`,
              })
              close()
            }}
          >
            Refund {payment ? formatMoney(payment.amount) : ''}
          </Button>
        </>
      }
    >
      {payment && (
        <div className="grid gap-4">
          <div className="rounded-lg border bg-secondary/40 p-4">
            <p className="text-xs text-muted-foreground">Amount going back</p>
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(payment.amount)}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{payment.reference}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            The full amount goes back to the card or UPI account the owner paid from. The plan stays
            on until its end date.
          </p>
          <Field label="Reason" required error={error}>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: charged twice for October"
            />
          </Field>
        </div>
      )}
    </Dialog>
  )
}
