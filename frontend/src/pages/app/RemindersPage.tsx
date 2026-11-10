import {
  AlarmClock,
  ArrowLeft,
  BellRing,
  IndianRupee,
  Mail,
  MessageCircle,
  PartyPopper,
  Phone,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import type { DueReminder, EmailResult } from '../../api/types'
import { ErrorBanner } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardHeader } from '../../components/ui-kit/card'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { Alert, EmptyState, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney, formatMonth, initials, plural } from '../../lib/format'
import { dueLabel, emailSummary } from '../../lib/reminders'

const DUE_TONE: Record<string, 'bad' | 'warn' | 'info'> = {
  overdue: 'bad',
  issued: 'warn',
  new: 'info',
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
  loading,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  tone?: 'bad'
  loading?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-md [&_svg]:size-3.5',
            tone === 'bad' ? 'bg-red-50 text-red-600' : 'bg-secondary text-muted-foreground',
          )}
        >
          {icon}
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-[26px] w-24" />
      ) : (
        <p
          className={cn(
            'mt-3 text-[22px] leading-none font-semibold tracking-[-0.025em] tabular-nums sm:text-[26px]',
            tone === 'bad' && 'text-destructive',
          )}
        >
          {value}
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
      {initials(name)}
    </span>
  )
}

function RowsSkeleton() {
  return (
    <div className="border-t" role="status" aria-label="Loading">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
          style={{ opacity: 1 - i * 0.15 }}
        >
          <Skeleton className="size-4" />
          <Skeleton className="size-8 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
          <Skeleton className="hidden h-[22px] w-20 md:block" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  )
}

export function RemindersPage() {
  const due = useApi<DueReminder[]>('/reminders/due')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<string | null>(null)
  const log = useApiMutation(
    (b: { invoice: string; channel: 'whatsapp' | 'sms' }) => api.post('/reminders/log', b),
    ['/reminders/'],
  )
  const email = useApiMutation(
    (ids: string[]) => api.post<EmailResult>('/reminders/email', { invoices: ids }),
    ['/reminders/'],
    (r) => {
      setResult(emailSummary(r))
      setSelected(new Set())
    },
  )
  const rows = due.data ?? []
  const withEmail = rows.filter((r) => r.tenant_email)
  const total = rows.reduce((sum, r) => sum + r.balance, 0)
  const overdue = rows.filter((r) => r.days_overdue > 0)

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function sendWhatsApp(r: DueReminder) {
    // Opens WhatsApp with the message filled in; the operator presses send.
    window.open(r.whatsapp_url, '_blank', 'noopener')
    log.mutate({ invoice: r.invoice_id, channel: 'whatsapp' })
  }

  function selectBox(r: DueReminder) {
    return (
      <Checkbox
        aria-label={`Select ${r.tenant_name}`}
        disabled={!r.tenant_email}
        title={r.tenant_email ? undefined : 'No email address'}
        checked={selected.has(r.invoice_id)}
        onCheckedChange={() => toggle(r.invoice_id)}
      />
    )
  }

  function actions(r: DueReminder) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => sendWhatsApp(r)}
          className="text-emerald-800 [&_svg]:text-emerald-600"
        >
          <MessageCircle /> WhatsApp
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={`tel:+91${r.tenant_phone}`} className="no-underline">
            <Phone /> Call
          </a>
        </Button>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            to="/app/billing"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground no-underline hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Rent & payments
          </Link>
        }
        title="Rent reminders"
        description="Unpaid rent that is overdue or due in the next 3 days."
        actions={
          <Button
            disabled={selected.size === 0}
            busy={email.isPending}
            onClick={() => email.mutate([...selected])}
          >
            {!email.isPending && <Mail />}
            Email selected ({selected.size})
          </Button>
        }
      />

      <div className="grid gap-5">
        {result && <Alert tone="good">{result}</Alert>}
        <ErrorBanner error={due.error ?? log.error ?? email.error} />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi
            label="Tenants to remind"
            value={rows.length}
            hint="Overdue or due in 3 days"
            icon={<Users />}
            loading={due.isLoading}
          />
          <Kpi
            label="Rent pending"
            value={formatMoney(total)}
            hint="Across these tenants"
            icon={<IndianRupee />}
            loading={due.isLoading}
          />
          <Kpi
            label="Overdue"
            value={overdue.length}
            hint={overdue.length ? 'Past the due date' : 'Nobody is late'}
            icon={<AlarmClock />}
            tone={overdue.length ? 'bad' : undefined}
            loading={due.isLoading}
          />
          <Kpi
            label="Can be emailed"
            value={withEmail.length}
            hint="Tenants with an email address"
            icon={<Mail />}
            loading={due.isLoading}
          />
        </div>

        {!due.isLoading && rows.length === 0 ? (
          <EmptyState icon={<PartyPopper />} title="Nobody to remind.">
            All rent due in the next 3 days is paid.
          </EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader
              title={
                rows.length
                  ? `${plural(rows.length, 'tenant')} · ${formatMoney(total)} pending`
                  : 'Tenants to remind'
              }
              description="Tick tenants to email them, or send a WhatsApp from your phone."
              actions={
                rows.length > 0 &&
                withEmail.length > 0 && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setSelected(new Set(withEmail.map((r) => r.invoice_id)))}
                  >
                    Select everyone with an email ({withEmail.length})
                  </Button>
                )
              }
            />
            {due.isLoading ? (
              <RowsSkeleton />
            ) : (
              <>
                <div className="hidden border-t md:block">
                  <Table>
                    <THead>
                      <TR>
                        <TH className="w-10">
                          <span className="sr-only">Select</span>
                        </TH>
                        <TH>Tenant</TH>
                        <TH className="text-right">Rent</TH>
                        <TH>Due</TH>
                        <TH>Last reminder</TH>
                        <TH className="text-right">
                          <span className="sr-only">Send</span>
                        </TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rows.map((r) => {
                        const badge = dueLabel(r)
                        return (
                          <TR
                            key={r.invoice_id}
                            data-state={selected.has(r.invoice_id) ? 'selected' : undefined}
                          >
                            <TD className="pr-0">{selectBox(r)}</TD>
                            <TD>
                              <div className="flex items-center gap-3">
                                <Avatar name={r.tenant_name} />
                                <div className="min-w-0">
                                  <Link
                                    to={`/app/tenants/${r.tenant_id}`}
                                    className="block truncate text-[13.5px] font-medium text-foreground no-underline hover:underline"
                                  >
                                    {r.tenant_name}
                                  </Link>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {r.property_name} · {r.place_label}
                                  </p>
                                </div>
                              </div>
                            </TD>
                            <TD className="text-right whitespace-nowrap">
                              <p className="font-medium">{formatMoney(r.balance)}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatMonth(r.period)}
                              </p>
                            </TD>
                            <TD className="whitespace-nowrap">
                              <Badge tone={DUE_TONE[badge.value] ?? 'neutral'} dot>
                                {badge.label}
                              </Badge>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDate(r.due_date)}
                              </p>
                            </TD>
                            <TD className="text-[13px] whitespace-nowrap text-muted-foreground">
                              {r.last_reminded_at ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <BellRing className="size-3.5 text-subtle-foreground" />
                                  {formatDate(r.last_reminded_at)}
                                </span>
                              ) : (
                                '—'
                              )}
                            </TD>
                            <TD>
                              <div className="flex items-center justify-end gap-1.5">
                                {actions(r)}
                              </div>
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                </div>

                <ul className="border-t md:hidden">
                  {rows.map((r) => {
                    const badge = dueLabel(r)
                    return (
                      <li
                        key={r.invoice_id}
                        className={cn(
                          'grid gap-3 border-b px-4 py-3.5 last:border-b-0',
                          selected.has(r.invoice_id) && 'bg-accent',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="pt-2">{selectBox(r)}</div>
                          <Avatar name={r.tenant_name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <Link
                                to={`/app/tenants/${r.tenant_id}`}
                                className="truncate text-[13.5px] font-medium text-foreground no-underline"
                              >
                                {r.tenant_name}
                              </Link>
                              <span className="shrink-0 text-[13.5px] font-semibold tabular-nums">
                                {formatMoney(r.balance)}
                              </span>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {r.property_name} · {r.place_label}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge tone={DUE_TONE[badge.value] ?? 'neutral'} dot>
                                {badge.label}
                              </Badge>
                              <span>
                                {formatMonth(r.period)} · due {formatDate(r.due_date)}
                              </span>
                            </div>
                            {r.last_reminded_at && (
                              <p className="mt-1 text-xs text-subtle-foreground">
                                Last reminder {formatDate(r.last_reminded_at)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 pl-[3.75rem]">{actions(r)}</div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </Card>
        )}

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Each tenant gets at most one reminder every 3 days. Automatic daily emails can be switched
          on with the{' '}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[12px] text-foreground">
            send_rent_reminders
          </code>{' '}
          command (see the README).
        </p>
      </div>
    </>
  )
}
