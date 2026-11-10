import { ArrowLeft, CircleCheck, Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { useApi } from '../../api/hooks'
import type { Payment } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { ErrorBanner } from '../../components/ui'
import { Button } from '../../components/ui-kit/button'
import { Skeleton } from '../../components/ui-kit/feedback'
import { formatDate, formatMoney, formatMonth, initials } from '../../lib/format'
import { PAYMENT_MODES, optionLabel } from '../../lib/options'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-4 border-b border-dashed py-3 last:border-b-0 sm:grid-cols-[11rem_1fr]">
      <dt className="text-[13px] whitespace-nowrap text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-[13.5px] font-medium break-words text-foreground tabular-nums">
        {children}
      </dd>
    </div>
  )
}

function ReceiptSkeleton() {
  return (
    <div className="mx-auto grid max-w-2xl gap-5" role="status" aria-label="Loading">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-44" />
      </div>
      <Skeleton className="h-[560px] rounded-2xl" />
    </div>
  )
}

export function ReceiptPage() {
  const { id = '' } = useParams()
  const { data: p, isLoading, error } = useApi<Payment>(`/payments/${id}/`)
  const logo = useAuth().membership?.organization.logo_url
  if (isLoading) return <ReceiptSkeleton />
  if (error || !p) return <ErrorBanner error={error ?? 'Not found'} />
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={`/app/billing/invoices/${p.invoice}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground no-underline hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Invoice {p.invoice_number}
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Print / save as PDF
        </Button>
      </div>

      <article className="overflow-hidden rounded-2xl border bg-card shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="h-1.5 bg-gradient-to-r from-[oklch(0.55_0.1_175)] to-primary print:hidden" />
        <header className="flex flex-wrap items-start justify-between gap-5 px-6 pt-7 pb-6 sm:px-10">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? (
              <img
                src={logo}
                alt=""
                width={56}
                height={56}
                className="size-14 shrink-0 rounded-xl border object-cover"
              />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-[17px] font-semibold text-accent-foreground">
                {initials(p.organization_name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{p.organization_name}</p>
              <p className="text-xs text-muted-foreground">{p.details.property_name}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">
              Payment receipt
            </h1>
            <p className="mt-1 font-mono text-[13px] text-muted-foreground">{p.receipt_number}</p>
          </div>
        </header>

        <div className="mx-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-600/15 bg-emerald-50/70 px-5 py-4 sm:mx-10">
          <div>
            <p className="text-[13px] font-medium text-emerald-900/80">Amount received</p>
            <p className="mt-1 text-[32px] leading-none font-semibold tracking-[-0.03em] text-emerald-950 tabular-nums">
              {formatMoney(p.amount)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[13px] font-medium text-emerald-800 shadow-xs">
            <CircleCheck className="size-4 text-emerald-600" aria-hidden />
            Received on {formatDate(p.received_on)}
          </span>
        </div>

        <dl className="px-6 pt-4 pb-2 sm:px-10">
          <Row label="Receipt no.">
            <span className="font-mono">{p.receipt_number}</span>
          </Row>
          <Row label="Date">{formatDate(p.received_on)}</Row>
          <Row label="Received from">
            {p.details.tenant_name} ({p.details.tenant_phone})
          </Row>
          <Row label="For">
            Rent for {formatMonth(p.invoice_period)} · invoice {p.invoice_number}
          </Row>
          <Row label="Bed">
            {p.details.property_name} · {p.details.place_label}
          </Row>
          <Row label="Paid by">
            {optionLabel(PAYMENT_MODES, p.mode)}
            {p.reference ? ` · ref ${p.reference}` : ''}
          </Row>
          <Row label="Amount">{formatMoney(p.amount)}</Row>
          <Row label="Balance on invoice">{formatMoney(p.invoice_balance)}</Row>
          {p.received_by && <Row label="Received by">{p.received_by}</Row>}
        </dl>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t bg-secondary/40 px-6 py-4 text-xs text-muted-foreground sm:px-10 print:bg-transparent">
          <span>Thank you for your payment.</span>
          <span className="tabular-nums">
            {p.organization_name} · {p.receipt_number}
          </span>
        </footer>
      </article>
    </div>
  )
}
