import {
  CheckCircle2,
  Download,
  IndianRupee,
  Loader2,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { Button } from '../../components/ui-kit/button'
import { EmptyState } from '../../components/ui-kit/feedback'
import { Input } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { INVOICE_STATUS, PAY_MODE, balance, daysLate } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Invoice } from '../../data/types'
import { cn } from '../../lib/cn'
import {
  formatDate,
  formatMoney,
  formatMonth,
  paiseToRupeesInput,
  rupeesToPaise,
} from '../../lib/format'
import { nextReceiptNumber, useMe } from './me'
import { CardTitle, Pill, ScreenTitle, TCard } from './ui'

function StatusPill({ invoice }: { invoice: Invoice }) {
  const s = INVOICE_STATUS[invoice.status]
  return <Pill tone={s.tone}>{s.label}</Pill>
}

export function RentList() {
  const me = useMe()
  const year = TODAY.slice(0, 4)
  const paidThisYear = me.payments
    .filter((p) => p.paidOn.startsWith(year))
    .reduce((s, p) => s + p.amount, 0)
  const pending = me.unpaid.reduce((s, i) => s + balance(i), 0)

  return (
    <>
      <ScreenTitle title="Rent" subtitle={me.property?.name} />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <TCard className="p-3.5">
          <p className="text-xs text-muted-foreground">Paid in {year}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(paidThisYear)}</p>
        </TCard>
        <TCard className={cn('p-3.5', pending > 0 && 'border-amber-200 bg-amber-50')}>
          <p className="text-xs text-muted-foreground">To pay now</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(pending)}</p>
        </TCard>
      </div>
      {pending > 0 && me.unpaid[0] && (
        <Button asChild size="lg" className="mb-5 h-12 w-full rounded-xl text-[15px]">
          <Link to={`/tenant/rent/pay?invoice=${me.unpaid[0].id}`}>
            <IndianRupee /> Pay {formatMoney(balance(me.unpaid[0]))} by UPI
          </Link>
        </Button>
      )}

      <h2 className="mb-2 text-[15px] font-semibold">Bills</h2>
      {me.invoices.length === 0 ? (
        <EmptyState icon={<ReceiptText />} title="No bills yet">
          Your first bill comes on the 1st of the month after you move in.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {me.invoices.map((i) => (
            <li key={i.id}>
              <Link
                to={`/tenant/rent/${i.id}`}
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs active:bg-secondary"
              >
                <span
                  className={cn(
                    'flex size-11 shrink-0 flex-col items-center justify-center rounded-xl text-[11px] leading-tight font-semibold',
                    i.status === 'paid'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-800',
                  )}
                >
                  {formatMonth(i.period).slice(0, 3)}
                  <span className="font-normal">{i.period.slice(0, 4)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{formatMonth(i.period)}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {i.status === 'paid' ? `Paid · ${i.number}` : `Due ${formatDate(i.dueOn)}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums">
                    {formatMoney(i.total)}
                  </span>
                  <StatusPill invoice={i} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function BillDetail() {
  const { invoiceId = '' } = useParams()
  const me = useMe()
  const invoice = me.invoices.find((i) => i.id === invoiceId)
  const payments = useMemo(
    () => me.payments.filter((p) => p.invoiceId === invoiceId),
    [me.payments, invoiceId],
  )

  if (!invoice) {
    return (
      <>
        <ScreenTitle title="Bill" back="/tenant/rent" />
        <EmptyState title="This bill was not found">Go back to Rent to see your bills.</EmptyState>
      </>
    )
  }
  const late = daysLate(invoice)

  return (
    <>
      <ScreenTitle
        title={`${formatMonth(invoice.period)} bill`}
        back="/tenant/rent"
        subtitle={invoice.number}
      />
      <TCard className="mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">
              {formatMoney(invoice.total)}
            </p>
          </div>
          <StatusPill invoice={invoice} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Bill date</dt>
            <dd className="font-medium">{formatDate(invoice.issuedOn)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Due on</dt>
            <dd className={cn('font-medium', late > 0 && 'text-red-600')}>
              {formatDate(invoice.dueOn)}
              {late > 0 && ` · ${late} days late`}
            </dd>
          </div>
        </dl>
      </TCard>

      <TCard className="mb-4">
        <CardTitle>What it is for</CardTitle>
        <ul className="grid gap-2 text-sm">
          {invoice.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>{l.label}</span>
              <span className="tabular-nums">{formatMoney(l.amount)}</span>
            </li>
          ))}
          <li className="mt-1 flex justify-between gap-2 border-t pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(invoice.total)}</span>
          </li>
          {invoice.paid > 0 && (
            <li className="flex justify-between gap-2 text-emerald-700">
              <span>Paid</span>
              <span className="tabular-nums">− {formatMoney(invoice.paid)}</span>
            </li>
          )}
          {balance(invoice) > 0 && (
            <li className="flex justify-between gap-2 font-semibold">
              <span>Left to pay</span>
              <span className="tabular-nums">{formatMoney(balance(invoice))}</span>
            </li>
          )}
        </ul>
      </TCard>

      <TCard className="mb-4">
        <CardTitle>Payments</CardTitle>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing paid for this bill yet.</p>
        ) : (
          <ul className="grid gap-3">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {formatMoney(p.amount)} · {PAY_MODE[p.mode]}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatDate(p.paidOn)} · {p.receipt}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Download receipt ${p.receipt}`}
                  onClick={() => toast.success(`Receipt ${p.receipt} saved to Downloads`)}
                >
                  <Download />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </TCard>

      {balance(invoice) > 0 ? (
        <Button asChild size="lg" className="h-12 w-full rounded-xl text-[15px]">
          <Link to={`/tenant/rent/pay?invoice=${invoice.id}`}>
            Pay {formatMoney(balance(invoice))} by UPI
          </Link>
        </Button>
      ) : (
        <Button
          size="lg"
          variant="outline"
          className="h-12 w-full rounded-xl text-[15px]"
          onClick={() =>
            toast.success(`Receipt for ${formatMonth(invoice.period)} saved to Downloads`)
          }
        >
          <Download /> Download receipt
        </Button>
      )}
    </>
  )
}

const UPI_APPS = [
  { code: 'gpay', name: 'Google Pay', short: 'G Pay', color: 'from-blue-500 to-emerald-500' },
  { code: 'phonepe', name: 'PhonePe', short: 'Pe', color: 'from-violet-600 to-purple-700' },
  { code: 'paytm', name: 'Paytm', short: 'Paytm', color: 'from-sky-500 to-blue-700' },
  { code: 'bhim', name: 'BHIM', short: 'BHIM', color: 'from-orange-500 to-emerald-600' },
] as const

export function PayRent() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const me = useMe()
  const upiId = useDb((db) => db.settings.upiId)
  const businessName = useDb((db) => db.business.name)
  const receipts = useDb((db) => db.payments)
  const invoice = me.invoices.find((i) => i.id === params.get('invoice')) ?? me.unpaid[0]
  const [app, setApp] = useState<(typeof UPI_APPS)[number]['code']>('gpay')
  const [amount, setAmount] = useState(invoice ? paiseToRupeesInput(balance(invoice)) : '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{
    receipt: string
    amount: number
    ref: string
    period: string
    full: boolean
  } | null>(null)

  if (done) {
    return (
      <div className="flex flex-col items-center pt-6 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="size-12 text-emerald-600" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Payment done</h1>
        <p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(done.amount)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatMonth(done.period)} rent · {done.full ? 'paid in full' : 'part payment'}
        </p>
        <TCard className="mt-6 w-full text-left">
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Receipt number</dt>
              <dd className="font-mono font-semibold">{done.receipt}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">UPI reference</dt>
              <dd className="font-mono">{done.ref}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Paid to</dt>
              <dd>{upiId}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatDate(TODAY)}</dd>
            </div>
          </dl>
        </TCard>
        <p className="mt-3 text-xs text-muted-foreground">
          The receipt was also sent to you on WhatsApp.
        </p>
        <div className="mt-6 grid w-full gap-2">
          <Button
            size="lg"
            className="h-12 rounded-xl"
            onClick={() => toast.success(`Receipt ${done.receipt} saved to Downloads`)}
          >
            <Download /> Download receipt
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => navigate('/tenant')}
          >
            Back to home
          </Button>
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <>
        <ScreenTitle title="Pay rent" back="/tenant/rent" />
        <EmptyState
          icon={<CheckCircle2 />}
          title="Nothing to pay"
          actions={
            <Button asChild variant="outline">
              <Link to="/tenant/rent">See bills</Link>
            </Button>
          }
        >
          All your bills are paid. Thank you!
        </EmptyState>
      </>
    )
  }

  const left = balance(invoice)
  const paise = rupeesToPaise(amount)
  const error =
    paise === null || paise <= 0
      ? 'Type the amount in rupees.'
      : paise > left
        ? `You only need to pay ${formatMoney(left)}.`
        : undefined
  const chosen = UPI_APPS.find((a) => a.code === app)!
  const target = invoice

  function pay() {
    if (error || paise === null) return
    setBusy(true)
    window.setTimeout(() => {
      const receipt = nextReceiptNumber(receipts.map((r) => r.receipt))
      const ref = `${Math.floor(400000000000 + Math.random() * 99999999999)}`
      const full = paise >= left
      updateDb((db) => {
        db.invoices = db.invoices.map((i) =>
          i.id === target.id
            ? {
                ...i,
                paid: i.paid + paise,
                status: i.paid + paise >= i.total ? 'paid' : 'partly_paid',
              }
            : i,
        )
        db.payments.unshift({
          id: newId('pay'),
          receipt,
          invoiceId: target.id,
          tenantId: target.tenantId,
          propertyId: target.propertyId,
          amount: paise,
          mode: 'upi',
          reference: `UPI ${ref} · ${chosen.name}`,
          paidOn: TODAY,
          collectedBy: 'Online',
        })
        logActivity(db, {
          by: me.tenant?.name ?? 'Tenant',
          action: `Paid ${formatMoney(paise)} by UPI from the tenant app`,
          target: `${formatMonth(target.period)} rent`,
          propertyId: target.propertyId,
          kind: 'rent',
        })
      })
      setBusy(false)
      setDone({ receipt, amount: paise, ref, period: target.period, full })
      toast.success('Payment received. Thank you!')
    }, 1200)
  }

  return (
    <>
      <ScreenTitle
        title="Pay rent"
        back="/tenant/rent"
        subtitle={`${formatMonth(invoice.period)} · ${invoice.number}`}
      />
      <TCard className="mb-4">
        <p className="text-xs text-muted-foreground">Amount</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-2xl font-semibold">₹</span>
          <Input
            aria-label="Amount in rupees"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-12 rounded-xl text-2xl font-semibold tabular-nums"
          />
        </div>
        {error ? (
          <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {paise !== null && paise < left
              ? `${formatMoney(left - paise)} will still be left to pay.`
              : 'Pays the whole bill.'}
          </p>
        )}
        {paise !== left && (
          <button
            type="button"
            onClick={() => setAmount(paiseToRupeesInput(left))}
            className="mt-2 text-[13px] font-medium text-primary"
          >
            Pay full {formatMoney(left)}
          </button>
        )}
      </TCard>

      <h2 className="mb-2 text-[15px] font-semibold">Pay with</h2>
      <div role="radiogroup" aria-label="UPI app" className="mb-4 grid grid-cols-4 gap-2">
        {UPI_APPS.map((a) => (
          <button
            key={a.code}
            type="button"
            role="radio"
            aria-checked={app === a.code}
            onClick={() => setApp(a.code)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-2xl border bg-card p-2.5 transition',
              app === a.code ? 'border-primary ring-2 ring-primary/30' : 'hover:bg-secondary/50',
            )}
          >
            <span
              className={cn(
                'flex size-11 items-center justify-center rounded-xl bg-gradient-to-br text-[11px] font-bold text-white',
                a.color,
              )}
            >
              {a.short}
            </span>
            <span className="text-[11px] leading-tight font-medium">{a.name}</span>
          </button>
        ))}
      </div>

      <TCard className="mb-5 flex items-center gap-3 p-3.5 text-[13px]">
        <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
        <span className="text-muted-foreground">
          Paying to <span className="font-medium text-foreground">{upiId}</span> ({businessName}).
          The receipt comes to you at once.
        </span>
      </TCard>

      <Button
        size="lg"
        className="h-14 w-full rounded-2xl text-base"
        disabled={Boolean(error) || busy}
        onClick={pay}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" /> Waiting for {chosen.name}…
          </>
        ) : (
          <>
            Pay {paise ? formatMoney(paise) : ''} with {chosen.name}
          </>
        )}
      </Button>
    </>
  )
}
