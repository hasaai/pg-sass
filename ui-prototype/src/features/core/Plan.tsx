/** Plan & billing: current plan, usage, compare plans, checkout and bills. */
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  Landmark,
  Smartphone,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { NoAccess, Section } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { ChoiceCards, Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, Meter, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input } from '../../components/ui-kit/input'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { plans, TODAY } from '../../data/seed'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { PlanCode } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { addMonths, formatDate, formatMoney } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { daysFromToday } from './util'

type Cycle = 'monthly' | 'yearly'
const GST = 0.18

const OLD_BILLS = [
  { id: 'old2', on: '2026-10-29', what: 'Pro trial started (14 days)', amount: 0, status: 'Free' },
  { id: 'old1', on: '2026-09-02', what: 'Starter · monthly', amount: 58882, status: 'Paid' },
  { id: 'old0', on: '2026-08-02', what: 'Starter · monthly', amount: 58882, status: 'Paid' },
]

function downloadInvoice(number: string, lines: string[]) {
  const text = [
    `PG Manager – Tax invoice ${number}`,
    '',
    ...lines,
    '',
    'PG Manager, HSR Layout, Bengaluru 560102 · GSTIN 29AAJCP1234M1Z9',
  ].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${number}.txt`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`Invoice ${number} downloaded`)
}

function limitText(n: number | null) {
  return n === null ? 'Unlimited' : String(n)
}

export function PlanPage() {
  useBreadcrumbs([{ label: 'Plan & billing' }])
  const navigate = useNavigate()
  const { can } = useSession()
  const business = useDb((db) => db.business)
  const properties = useDb((db) => db.properties)
  const beds = useDb((db) => db.beds)
  const members = useDb((db) => db.members)
  const tenants = useDb((db) => db.tenants)
  const payments = useDb((db) => db.platformPayments)
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [methodOpen, setMethodOpen] = useState(false)
  const [method, setMethod] = useState('UPI AutoPay · asha@okhdfc')
  const [newUpi, setNewUpi] = useState('')

  if (!can('plan.billing')) return <NoAccess what="plan and billing" />

  const current = plans.find((p) => p.code === business.plan)!
  const daysLeft = daysFromToday(business.planRenewsOn)
  const usage = [
    {
      label: 'Properties',
      used: properties.filter((p) => p.status !== 'archived').length,
      max: current.limits.properties,
    },
    { label: 'Beds', used: beds.length, max: current.limits.beds },
    { label: 'Team members', used: members.length, max: current.limits.team },
    {
      label: 'Tenants',
      used: tenants.filter((t) => t.status !== 'moved_out').length,
      max: current.limits.tenants,
    },
  ]
  const myPayments = payments.filter((p) => p.business === business.name)

  return (
    <div>
      <PageHeader
        title="Plan & billing"
        description="Your PG Manager plan, what you use and your bills."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Section title="Your plan">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-semibold tracking-tight">{current.name}</p>
                {business.planStatus === 'trial' ? (
                  <Badge tone="info">Free trial</Badge>
                ) : (
                  <Badge tone="good">Active</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {business.planStatus === 'trial'
                  ? `Trial ends on ${formatDate(business.planRenewsOn)} · ${daysLeft} days left`
                  : `Renews on ${formatDate(business.planRenewsOn)}`}
              </p>
            </div>
            {business.planStatus === 'trial' && (
              <div className="rounded-lg bg-accent px-3 py-2 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{daysLeft}</p>
                <p className="text-[11px] text-muted-foreground">days left</p>
              </div>
            )}
          </div>
          {business.planStatus === 'trial' && (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${((14 - daysLeft) / 14) * 100}%` }}
                />
              </div>
              <Alert tone="info" className="mt-4">
                After the trial you move to Free unless you choose a plan. Your data is never
                deleted.
              </Alert>
              <Button
                className="mt-4 w-full sm:w-auto"
                onClick={() => navigate(`/app/plan/checkout?plan=pro&cycle=${cycle}`)}
              >
                Keep Pro –{' '}
                {formatMoney(cycle === 'monthly' ? current.pricePerMonth : current.pricePerYear)}
                {cycle === 'monthly' ? '/month' : '/year'}
              </Button>
            </>
          )}
        </Section>

        <Section title="What you use" description={`Limits of the ${current.name} plan`}>
          <div className="grid gap-4 sm:grid-cols-2">
            {usage.map((u) => (
              <div key={u.label}>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{u.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {u.used} / {limitText(u.max)}
                  </span>
                </div>
                <Meter value={u.used} max={u.max ?? u.used * 4} label={u.label} />
                {u.max !== null && u.used / u.max >= 0.8 && (
                  <p className="mt-1 text-xs text-amber-700">Almost at the limit</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      </div>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Compare plans</h2>
          <div className="flex items-center gap-2">
            <Segmented
              label="Billing cycle"
              value={cycle}
              onChange={setCycle}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
            />
            <Badge tone="good">2 months free</Badge>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => {
            const price = cycle === 'monthly' ? p.pricePerMonth : p.pricePerYear
            const isCurrent = p.code === business.plan
            return (
              <div
                key={p.code}
                className={cn(
                  'relative flex flex-col rounded-xl border bg-card p-5 shadow-xs',
                  p.popular && 'border-primary ring-1 ring-primary',
                )}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                    Most popular
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {isCurrent && <Badge tone="info">Current</Badge>}
                </div>
                <p className="mt-2">
                  <span className="text-2xl font-bold tracking-tight">{formatMoney(price)}</span>
                  <span className="text-sm text-muted-foreground">
                    {price ? (cycle === 'monthly' ? ' /month' : ' /year') : ''}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">+ 18% GST</p>
                <dl className="mt-4 grid grid-cols-2 gap-1 text-xs">
                  <dt className="text-muted-foreground">Properties</dt>
                  <dd className="text-right font-medium">{limitText(p.limits.properties)}</dd>
                  <dt className="text-muted-foreground">Beds</dt>
                  <dd className="text-right font-medium">{limitText(p.limits.beds)}</dd>
                  <dt className="text-muted-foreground">Team</dt>
                  <dd className="text-right font-medium">{limitText(p.limits.team)}</dd>
                </dl>
                <ul className="mt-4 flex-1 space-y-1.5 text-[13px]">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-5 w-full"
                  variant={p.popular ? 'default' : 'outline'}
                  disabled={p.code === 'free' || (isCurrent && business.planStatus === 'active')}
                  onClick={() => navigate(`/app/plan/checkout?plan=${p.code}&cycle=${cycle}`)}
                >
                  {isCurrent
                    ? business.planStatus === 'trial'
                      ? 'Choose plan'
                      : 'Current plan'
                    : p.code === 'free'
                      ? 'After trial'
                      : 'Choose plan'}
                </Button>
              </div>
            )
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Section title="Bills" bodyClassName="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>For</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Invoice</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {[
                ...myPayments.map((p) => ({
                  id: p.id,
                  on: p.paidOn,
                  what: `${plans.find((x) => x.code === p.plan)?.name} plan`,
                  amount: p.amount,
                  status:
                    p.status === 'paid' ? 'Paid' : p.status === 'failed' ? 'Failed' : 'Refunded',
                })),
                ...OLD_BILLS,
              ].map((b) => (
                <TR key={b.id}>
                  <TD className="whitespace-nowrap">{formatDate(b.on)}</TD>
                  <TD className="whitespace-nowrap">{b.what}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(b.amount)}</TD>
                  <TD>
                    <Badge
                      tone={
                        b.status === 'Paid' ? 'good' : b.status === 'Failed' ? 'bad' : 'neutral'
                      }
                    >
                      {b.status}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {b.amount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          downloadInvoice(`PGM-${b.id.toUpperCase()}`, [
                            `Date: ${formatDate(b.on)}`,
                            `For: ${b.what}`,
                            `Amount incl. GST: ${formatMoney(b.amount)}`,
                          ])
                        }
                      >
                        <Download /> Invoice
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
        <Section title="Payment method">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
              <Smartphone className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{method}</p>
              <p className="text-xs text-muted-foreground">Charged on the renewal day</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setMethodOpen(true)}>
            Change
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            Bills go to {business.email}. GSTIN on invoices: {business.gstin || 'not added'}.
          </p>
        </Section>
      </div>

      <Dialog
        open={methodOpen}
        onOpenChange={setMethodOpen}
        title="Change payment method"
        description="We’ll ask your UPI app to approve AutoPay."
        footer={
          <>
            <Button variant="outline" onClick={() => setMethodOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!/^[\w.-]{2,}@[a-z]{2,}$/i.test(newUpi.trim())) {
                  toast.error('Enter a UPI ID like name@okhdfc')
                  return
                }
                setMethod(`UPI AutoPay · ${newUpi.trim()}`)
                setMethodOpen(false)
                setNewUpi('')
                toast.success('Payment method changed')
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="UPI ID">
          <Input
            value={newUpi}
            onChange={(e) => setNewUpi(e.target.value)}
            placeholder="name@okhdfc"
          />
        </Field>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ checkout */

export function CheckoutPage() {
  useBreadcrumbs([{ label: 'Plan & billing', to: '/app/plan' }, { label: 'Checkout' }])
  const navigate = useNavigate()
  const { can, person } = useSession()
  const business = useDb((db) => db.business)
  const [params, setParams] = useSearchParams()
  const code = (params.get('plan') as PlanCode) || 'pro'
  const cycle: Cycle = params.get('cycle') === 'yearly' ? 'yearly' : 'monthly'
  const plan =
    plans.find((p) => p.code === code && p.code !== 'free') ?? plans.find((p) => p.code === 'pro')!
  const [pay, setPay] = useState<'upi' | 'card' | 'netbanking'>('upi')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ number: string; total: number; renews: string } | null>(null)

  if (!can('plan.billing')) return <NoAccess what="plan and billing" />

  const price = cycle === 'monthly' ? plan.pricePerMonth : plan.pricePerYear
  const gst = Math.round(price * GST)
  const total = price + gst
  const starts = business.planStatus === 'trial' ? business.planRenewsOn : TODAY
  const renews = addMonths(starts, cycle === 'monthly' ? 1 : 12)

  function payNow() {
    setBusy(true)
    window.setTimeout(() => {
      const number = `PGM-${TODAY.replace(/-/g, '')}-${Math.floor(total / 7) % 10000}`
      updateDb((db) => {
        db.business.plan = plan.code
        db.business.planStatus = 'active'
        db.business.planRenewsOn = renews
        db.platformPayments.unshift({
          id: newId('pp'),
          business: db.business.name,
          plan: plan.code,
          amount: total,
          gateway: 'razorpay',
          status: 'paid',
          paidOn: TODAY,
          reference: number,
        })
        logActivity(db, {
          by: person.name,
          kind: 'settings',
          action: `Paid for the ${plan.name} plan (${cycle}) – ${formatMoney(total)}`,
          target: 'Plan & billing',
        })
      })
      setBusy(false)
      setDone({ number, total, renews })
      toast.success('Payment received. Thank you!')
    }, 900)
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg py-6 text-center">
        <CheckCircle2 className="mx-auto size-16 text-emerald-600" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">You’re on {plan.name}</h1>
        <p className="mt-2 text-muted-foreground">
          We received {formatMoney(done.total)}. Your plan renews on {formatDate(done.renews)}. A
          copy of the invoice is on its way to {business.email}.
        </p>
        <div className="mt-6 rounded-xl border bg-card p-4 text-left text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">Invoice</dt>
            <dd className="text-right font-medium">{done.number}</dd>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="text-right">
              {plan.name} · {cycle}
            </dd>
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="text-right font-semibold tabular-nums">{formatMoney(done.total)}</dd>
          </dl>
        </div>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() =>
              downloadInvoice(done.number, [
                `Bill to: ${business.name}, ${business.address}`,
                `GSTIN: ${business.gstin}`,
                `${plan.name} plan (${cycle}): ${formatMoney(price)}`,
                `GST 18%: ${formatMoney(gst)}`,
                `Total paid: ${formatMoney(done.total)}`,
              ])
            }
          >
            <Download /> Download invoice
          </Button>
          <Button onClick={() => navigate('/app')}>Go to dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2"
        onClick={() => navigate('/app/plan')}
      >
        <ArrowLeft /> Plans
      </Button>
      <PageHeader title="Checkout" description="Pay for your PG Manager plan." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-6">
          <Section title="Plan">
            <div className="grid gap-4">
              <ChoiceCards
                label="Plan"
                columns={3}
                value={plan.code}
                onChange={(v) => setParams({ plan: v, cycle }, { replace: true })}
                choices={plans
                  .filter((p) => p.code !== 'free')
                  .map((p) => ({
                    value: p.code,
                    label: p.name,
                    description: `${formatMoney(cycle === 'monthly' ? p.pricePerMonth : p.pricePerYear)} ${cycle === 'monthly' ? '/month' : '/year'}`,
                  }))}
              />
              <Segmented
                label="Billing cycle"
                value={cycle}
                onChange={(v) => setParams({ plan: plan.code, cycle: v }, { replace: true })}
                options={[
                  { value: 'monthly', label: 'Pay monthly' },
                  { value: 'yearly', label: 'Pay yearly – 2 months free' },
                ]}
              />
            </div>
          </Section>
          <Section title="Pay with">
            <ChoiceCards
              label="Payment method"
              value={pay}
              onChange={setPay}
              choices={[
                {
                  value: 'upi',
                  label: 'UPI',
                  description: 'GPay, PhonePe, Paytm',
                  icon: <Smartphone />,
                },
                {
                  value: 'card',
                  label: 'Card',
                  description: 'Debit or credit',
                  icon: <CreditCard />,
                },
                {
                  value: 'netbanking',
                  label: 'Net banking',
                  description: 'All major banks',
                  icon: <Landmark />,
                },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Payments are handled securely by Razorpay. We never see your card or UPI PIN.
            </p>
          </Section>
        </div>
        <aside>
          <Section title="Order summary">
            <div className="flex items-center gap-3 border-b pb-4">
              <span className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
                <Building2 className="size-4" />
              </span>
              <div>
                <p className="font-medium">{plan.name} plan</p>
                <p className="text-xs text-muted-foreground">
                  {cycle === 'monthly' ? 'Monthly' : 'Yearly'} · {formatDate(starts)} –{' '}
                  {formatDate(renews)}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 py-4 text-sm">
              <dt className="text-muted-foreground">Price</dt>
              <dd className="text-right tabular-nums">{formatMoney(price)}</dd>
              <dt className="text-muted-foreground">GST (18%)</dt>
              <dd className="text-right tabular-nums">{formatMoney(gst)}</dd>
              <dt className="border-t pt-2 font-semibold">Total</dt>
              <dd className="border-t pt-2 text-right font-semibold tabular-nums">
                {formatMoney(total)}
              </dd>
            </dl>
            {business.planStatus === 'trial' && (
              <p className="mb-3 text-xs text-muted-foreground">
                Your trial days are kept – the plan starts when the trial ends.
              </p>
            )}
            <Button className="w-full" size="lg" busy={busy} onClick={payNow}>
              Pay {formatMoney(total)}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Prototype – no money is charged.
            </p>
          </Section>
        </aside>
      </div>
    </div>
  )
}
