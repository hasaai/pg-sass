import { CreditCard, FlaskConical, Receipt } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Card, CardHeader } from '../../components/ui-kit/card'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { EmptyState, ErrorAlert, PageHeader } from '../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { formatDate, formatMoney } from '../../lib/format'
import type { PaymentGateway, PlanPayment } from '../plans/plans'
import { LogoTile, TableSkeleton } from './parts'

type PaymentPage = { count: number; results: PlanPayment[]; next?: string | null }

function GatewayRow({ g }: { g: PaymentGateway }) {
  const save = useApiMutation(
    (body: Partial<PaymentGateway>) => api.patch(`/platform/gateways/${g.code}/`, body),
    ['/platform/gateways/'],
    () => toast.success('Saved'),
  )
  return (
    <TR>
      <TD className="max-w-0 min-w-36 sm:max-w-none">
        <div className="flex items-start gap-3">
          <LogoTile icon={<CreditCard />} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13.5px] font-medium">{g.name}</span>
              {g.configured && g.test_mode && (
                <Badge tone="warn">
                  <FlaskConical className="size-3" /> Test mode
                </Badge>
              )}
              {g.configured && !g.test_mode && (
                <Badge tone="good" dot>
                  Live
                </Badge>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {g.unavailable_reason ||
                (g.configured
                  ? 'Keys are set on the server.'
                  : 'Keys are not set on the server yet.')}
            </p>
            {save.error && (
              <p className="mt-1 text-xs font-medium text-destructive">{save.error.message}</p>
            )}
          </div>
        </div>
      </TD>
      <TD className="text-center">
        <Checkbox
          aria-label={`Owners can pay with ${g.name}`}
          checked={!!g.is_enabled}
          disabled={!g.configured && !g.is_enabled}
          onCheckedChange={(v) => save.mutate({ is_enabled: v === true })}
        />
      </TD>
      <TD className="text-center">
        <input
          type="radio"
          name="default-gateway"
          data-slot="input"
          aria-label={`${g.name} is shown first`}
          checked={!!g.is_default}
          disabled={!g.is_enabled}
          onChange={() => save.mutate({ is_default: true })}
          className="size-4 cursor-pointer align-middle accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        />
      </TD>
    </TR>
  )
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'created', label: 'Not paid yet' },
  { value: 'failed', label: 'Failed' },
]

export function PaymentsPage() {
  useBreadcrumbs([{ label: 'Plan payments' }])
  const { canPlatform } = useAuth()
  const seesGateways = canPlatform('p.gateways.manage')
  const seesPayments = canPlatform('p.payments.view')
  const gateways = useApi<PaymentGateway[]>(seesGateways ? '/platform/gateways/' : null)
  const [state, setState] = useState('')
  const payments = useApi<PaymentPage>(seesPayments ? '/platform/payments/' : null, {
    status: state || undefined,
  })
  const rows = payments.data?.results ?? []
  return (
    <>
      <PageHeader
        title="Plan payments"
        description="How businesses pay for their plan, and every payment made."
      />
      <div className="grid gap-5">
        {seesGateways && (
          <Card className="overflow-hidden">
            <CardHeader
              title="Payment methods"
              description="Keys live only in the server's .env file, never here. Test keys take no real money."
            />
            <ErrorAlert error={gateways.error} className="mx-5 mb-4" />
            {gateways.isLoading ? (
              <div className="border-t">
                <TableSkeleton rows={2} />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Gateway</TH>
                    <TH className="w-20 text-center leading-tight whitespace-normal sm:w-36">
                      Owners can use
                    </TH>
                    <TH className="w-16 text-center leading-tight whitespace-normal sm:w-36">
                      Shown first
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {(gateways.data ?? []).map((g) => (
                    <GatewayRow key={g.code} g={g} />
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        )}
        {seesPayments && (
          <Card className="overflow-hidden">
            <CardHeader
              title="Payments"
              description={
                payments.data
                  ? `${payments.data.count} payment${payments.data.count === 1 ? '' : 's'}`
                  : undefined
              }
              actions={
                <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
                  <Segmented
                    label="Show"
                    value={state}
                    onChange={setState}
                    options={STATUS_FILTERS}
                  />
                </div>
              }
            />
            <ErrorAlert error={payments.error} className="mx-5 mb-4" />
            {payments.isLoading ? (
              <div className="border-t">
                <TableSkeleton rows={4} />
              </div>
            ) : rows.length === 0 ? (
              <div className="border-t p-4">
                <EmptyState className="border-0 py-10" icon={<Receipt />} title="No payments yet">
                  {state
                    ? 'No payments with this status.'
                    : 'Payments show up here when a business pays for a plan.'}
                </EmptyState>
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Business</TH>
                    <TH className="hidden md:table-cell">Date</TH>
                    <TH className="hidden lg:table-cell">Gateway</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((p) => (
                    <TR key={p.id}>
                      <TD className="max-w-0 min-w-36 sm:max-w-none">
                        <Link
                          to={`/platform/businesses/${p.organization}`}
                          className="block truncate text-[13.5px] font-medium text-foreground no-underline hover:underline"
                        >
                          {p.business}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.plan_name} · {p.period_label}
                          <span className="md:hidden">
                            {' '}
                            · {formatDate(p.created_at.slice(0, 10))}
                          </span>
                        </p>
                      </TD>
                      <TD className="hidden text-[13px] whitespace-nowrap text-muted-foreground md:table-cell">
                        {formatDate(p.created_at.slice(0, 10))}
                      </TD>
                      <TD className="hidden text-[13px] lg:table-cell">
                        <span className="flex items-center gap-1.5">
                          {p.gateway_label}
                          {p.test_mode && <Badge tone="warn">Test</Badge>}
                        </span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {p.gateway_payment_id || p.gateway_order_id}
                        </span>
                      </TD>
                      <TD className="text-right font-medium whitespace-nowrap">
                        {formatMoney(p.amount)}
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            p.status === 'paid' ? 'good' : p.status === 'failed' ? 'bad' : 'neutral'
                          }
                          dot
                        >
                          {p.status_label}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </>
  )
}
