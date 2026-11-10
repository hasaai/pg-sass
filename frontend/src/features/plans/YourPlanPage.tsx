import { CheckCircle2, CircleSlash, CreditCard, FlaskConical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import { useAuth } from '../../auth/AuthContext'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, ErrorAlert, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney } from '../../lib/format'
import { openPaymentWindow } from './checkout'
import type {
  CheckoutGateway,
  MyPlan,
  Period,
  PlanCheckoutResult,
  PlanPayment,
  PublicPlan,
  Usage,
} from './plans'
import {
  PLAN_QUERIES,
  limitWords,
  monthsSaved,
  nearLimits,
  planStatusWords,
  priceWords,
  usageLevel,
  usageWords,
} from './plans'

function UsageRow({ u }: { u: Usage }) {
  const level = usageLevel(u)
  const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[13px]">
        <span>{u.label}</span>
        <span className={cn('tabular-nums', level !== 'ok' && 'font-medium text-amber-700')}>
          {usageWords(u)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={u.label}
        aria-valuemin={0}
        aria-valuemax={u.limit ?? u.used}
        aria-valuenow={u.used}
        className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
      >
        {u.limit !== null && (
          <div
            className={cn(
              'h-full rounded-full',
              level === 'full' ? 'bg-destructive' : level === 'near' ? 'bg-warning' : 'bg-primary',
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  )
}

function PlanChoice({
  plan,
  period,
  current,
  featureLabels,
  canPay,
  onChoose,
}: {
  plan: PublicPlan
  period: Period
  current: boolean
  featureLabels: Map<string, string>
  canPay: boolean
  onChoose: () => void
}) {
  const limits = plan.limits ?? {}
  const free = !plan.price_month && !plan.price_year
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-card p-4',
        current && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{plan.name}</h3>
        {current && <Badge tone="info">Your plan</Badge>}
      </div>
      <p className="mt-1 text-xl font-semibold">{priceWords(plan, period)}</p>
      {period === 'year' && monthsSaved(plan) > 0 && (
        <p className="text-xs text-emerald-700">{monthsSaved(plan)} months free</p>
      )}
      {plan.description && (
        <p className="mt-2 text-[13px] text-muted-foreground">{plan.description}</p>
      )}
      <ul className="mt-3 grid gap-1 text-[13px]">
        <li>{limitWords(limits.properties)} properties</li>
        <li>{limitWords(limits.beds)} beds</li>
        <li>{limitWords(limits.team)} team members</li>
        {(plan.features ?? [])
          .filter((k) => featureLabels.has(k))
          .map((k) => (
            <li key={k} className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600" /> {featureLabels.get(k)}
            </li>
          ))}
      </ul>
      <div className="mt-auto pt-4">
        {!free && canPay && (
          <Button className="w-full" variant={current ? 'outline' : 'default'} onClick={onChoose}>
            {current ? 'Pay to renew' : `Choose ${plan.name}`}
          </Button>
        )}
      </div>
    </div>
  )
}

function PayDialog({
  plan,
  period,
  onClose,
}: {
  plan: PublicPlan
  period: Period
  onClose: () => void
}) {
  const { reloadUser } = useAuth()
  const gateways = useApi<CheckoutGateway[]>('/plan/gateways/')
  const [choice, setChoice] = useState('')
  const [problem, setProblem] = useState('')
  const gateway =
    choice || gateways.data?.find((g) => g.is_default)?.code || gateways.data?.[0]?.code || ''
  const confirm = useApiMutation(
    (body: { payment: string; result?: Record<string, unknown> }) =>
      api.post<PlanPayment>('/plan/confirm/', body),
    PLAN_QUERIES,
    async () => {
      await reloadUser()
      toast.success(`Payment received. You are now on ${plan.name}.`)
      onClose()
    },
  )
  const start = useApiMutation(
    (body: { plan: string; period: Period; gateway: string }) =>
      api.post<PlanCheckoutResult>('/plan/checkout/', body),
    [],
    async (res) => {
      setProblem('')
      try {
        const outcome = await openPaymentWindow(res.payment.gateway, res.checkout)
        if (outcome.kind === 'paid')
          confirm.mutate({ payment: res.payment.id, result: outcome.result })
        else if (outcome.kind === 'failed') setProblem(outcome.message)
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'The payment window did not open.')
      }
    },
  )
  const chosen = gateways.data?.find((g) => g.code === gateway)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Pay for ${plan.name}`}
      description={`${priceWords(plan, period)}. Your plan starts as soon as the payment is confirmed.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!gateway}
            busy={start.isPending || confirm.isPending}
            onClick={() => start.mutate({ plan: plan.key, period, gateway })}
          >
            <CreditCard /> Pay {formatMoney(period === 'year' ? plan.price_year : plan.price_month)}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {gateways.isLoading ? (
          <Skeleton className="h-16" />
        ) : (gateways.data?.length ?? 0) === 0 ? (
          <Alert tone="warn" title="Online payment is not set up yet">
            Contact the PG Manager team to pay for your plan.
          </Alert>
        ) : (
          <div role="radiogroup" aria-label="Pay with" className="grid gap-2">
            {gateways.data!.map((g) => (
              <label
                key={g.code}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-[13px]',
                  g.code === gateway && 'border-primary ring-1 ring-primary',
                )}
              >
                <input
                  type="radio"
                  name="gateway"
                  value={g.code}
                  checked={g.code === gateway}
                  onChange={() => setChoice(g.code)}
                />
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground">UPI, cards, net banking</span>
                {g.test_mode && (
                  <Badge tone="warn" className="ml-auto">
                    <FlaskConical className="size-3" /> Test mode
                  </Badge>
                )}
              </label>
            ))}
          </div>
        )}
        {chosen?.test_mode && (
          <p className="text-xs text-muted-foreground">
            Test mode: no real money is taken. Use the test card or UPI shown in the payment window.
          </p>
        )}
        {problem && <Alert tone="bad">{problem}</Alert>}
        <ErrorAlert error={start.error ?? confirm.error} />
      </div>
    </Dialog>
  )
}

/** Cashfree sends the owner back here with ?payment=<id>; check it once, then clean the URL. */
function useReturnFromGateway() {
  const [params, setParams] = useSearchParams()
  const { reloadUser } = useAuth()
  const done = useRef(false)
  const paymentId = params.get('payment')
  const confirm = useApiMutation(
    (payment: string) => api.post<PlanPayment>('/plan/confirm/', { payment }),
    PLAN_QUERIES,
    async (p) => {
      await reloadUser()
      toast.success(`Payment received. You are now on ${p.plan_name}.`)
    },
  )
  useEffect(() => {
    if (!paymentId || done.current) return
    done.current = true
    confirm.mutate(paymentId)
    setParams({}, { replace: true })
  }, [paymentId, confirm, setParams])
  return confirm
}

function PaymentsCard() {
  const payments = useApi<PlanPayment[]>('/plan/payments/')
  if (!payments.data?.length) return null
  return (
    <Card>
      <CardHeader title="Payments" />
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Date</TH>
            <TH>Plan</TH>
            <TH>Amount</TH>
            <TH>Paid with</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {payments.data.map((p) => (
            <TR key={p.id}>
              <TD className="text-[13px]">{formatDate(p.created_at.slice(0, 10))}</TD>
              <TD className="text-[13px]">
                {p.plan_name} · {p.period_label}
              </TD>
              <TD className="tabular-nums">{formatMoney(p.amount)}</TD>
              <TD className="text-[13px]">
                {p.gateway_label}
                {p.test_mode && <span className="text-muted-foreground"> (test)</span>}
              </TD>
              <TD>
                <Badge
                  tone={p.status === 'paid' ? 'good' : p.status === 'failed' ? 'bad' : 'neutral'}
                >
                  {p.status_label}
                </Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  )
}

export function YourPlanPage() {
  useBreadcrumbs([{ label: 'Your plan' }])
  const { can } = useAuth()
  const isOwner = can('plan.billing')
  const mine = useApi<MyPlan>('/plan/')
  const choices = useApi<PublicPlan[]>('/plan/choices/')
  const [period, setPeriod] = useState<Period>('month')
  const [paying, setPaying] = useState<PublicPlan | null>(null)
  const returned = useReturnFromGateway()

  if (mine.isLoading) return <Skeleton className="h-96" />
  if (!mine.data) return <ErrorAlert error={mine.error} />
  const p = mine.data
  const near = nearLimits(p.usage)
  const featureLabels = new Map(p.features.map((f) => [f.key, f.label]))
  const current = p.status === 'expired' ? 'free' : p.plan_key

  return (
    <>
      <PageHeader
        title="Your plan"
        description="What your business can use, and how much of it you are using."
      />
      <ErrorAlert error={returned.error} className="mb-4" />
      {p.status === 'expired' && (
        <Alert tone="warn" title="Your plan has ended" className="mb-4">
          Everything you added is safe. Some features are paused and you cannot add more than the
          Free plan allows until you choose a plan.
        </Alert>
      )}
      {p.status === 'trial' && (p.days_left ?? 99) <= 5 && (
        <Alert tone="warn" title="Your free trial ends soon" className="mb-4">
          Choose a plan to keep using {p.plan_name} features after {formatDate(p.ends_on)}.
        </Alert>
      )}
      {near.length > 0 && (
        <Alert tone="warn" className="mb-4">
          You have nearly used all your {near.map((u) => u.label.toLowerCase()).join(', ')}. Choose
          a bigger plan to add more.
        </Alert>
      )}

      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                {p.plan_name}
                <Badge
                  tone={p.status === 'expired' ? 'warn' : p.status === 'trial' ? 'info' : 'good'}
                >
                  {p.status_label}
                </Badge>
              </span>
            }
            description={planStatusWords(p)}
          />
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {p.usage.map((u) => (
              <UsageRow key={u.key} u={u} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Included" />
          <CardContent>
            <ul className="grid gap-1.5 text-[13px]">
              {p.features.map((f) => (
                <li
                  key={f.key}
                  className={cn('flex items-center gap-2', !f.on && 'text-muted-foreground')}
                >
                  {f.on ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : (
                    <CircleSlash className="size-4" />
                  )}
                  {f.label}
                </li>
              ))}
              {p.allowances
                .filter((a) => a.per_month > 0)
                .map((a) => (
                  <li key={a.key} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    {a.label}: {a.per_month} a month
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Plans</h2>
        <Segmented
          label="Pay every"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: 'Monthly' },
            { value: 'year', label: 'Yearly' },
          ]}
        />
      </div>
      {!isOwner && (
        <p className="mb-3 text-[13px] text-muted-foreground">
          Only the business owner (or someone they allow) can change or pay for the plan.
        </p>
      )}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {(choices.data ?? []).map((plan) => (
          <PlanChoice
            key={plan.key}
            plan={plan}
            period={period}
            current={plan.key === current}
            featureLabels={featureLabels}
            canPay={isOwner}
            onChoose={() => setPaying(plan)}
          />
        ))}
      </div>
      {can('plan.view') && <PaymentsCard />}
      {paying && <PayDialog plan={paying} period={period} onClose={() => setPaying(null)} />}
    </>
  )
}
