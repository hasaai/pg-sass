import { CalendarClock, CheckCheck, RotateCcw, Send, Settings2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Avatar, FilterChips, Money, PropertyPicker, Section } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { balance, daysLate, placeLabel } from '../../data/selectors'
import { logActivity, updateDb, useDb } from '../../data/store'
import type { Reminder } from '../../data/types'
import { useSession } from '../../demo/session'
import { formatDate, formatMoney } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { NoAccessGuard } from './guards'
import { CHANNEL_WORD, THIS_MONTH, TODAY, addDays, reminderText, sendReminders } from './lib'
import { ReminderPreview } from './money-dialogs'

const REMINDER_STATUS = {
  sent: { label: 'Sent', tone: 'neutral' },
  delivered: { label: 'Delivered', tone: 'info' },
  read: { label: 'Read', tone: 'good' },
  failed: { label: 'Not delivered', tone: 'bad' },
} as const
const KIND_LABEL: Record<Reminder['kind'], string> = {
  before_due: 'Before due date',
  due_day: 'On due day',
  overdue: 'After due date',
}

export function RemindersPage() {
  return (
    <NoAccessGuard perm="rent.view" what="rent reminders">
      <Reminders />
    </NoAccessGuard>
  )
}

function Reminders() {
  useBreadcrumbs([{ label: 'Rent reminders' }])
  const { can, person } = useSession()
  const db = useDb((d) => d)
  const { settings } = db
  const [propertyId, setPropertyId] = useState('')
  const [channel, setChannel] = useState<Reminder['channel']>('whatsapp')
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [historyFilter, setHistoryFilter] = useState<'all' | Reminder['status']>('all')
  const collect = can('rent.collect')

  const unpaid = useMemo(
    () =>
      db.invoices.filter(
        (i) =>
          i.period === THIS_MONTH &&
          i.status !== 'paid' &&
          (!propertyId || i.propertyId === propertyId),
      ),
    [db.invoices, propertyId],
  )
  const overdue = unpaid.filter((i) => i.dueOn < TODAY).sort((a, b) => daysLate(b) - daysLate(a))
  const selected = picked ?? new Set(overdue.map((i) => i.id))
  const chosen = overdue.filter((i) => selected.has(i.id))
  const sample = chosen[0] ?? overdue[0]
  const sampleTenant = db.tenants.find((t) => t.id === sample?.tenantId)

  const schedule = [
    {
      label: `${settings.reminderBeforeDays} days before the due date`,
      offset: -settings.reminderBeforeDays,
    },
    { label: 'On the due date', offset: 0 },
    { label: '2 days after the due date', offset: 2 },
  ].map((s) => {
    const dates = new Map<string, number>()
    for (const i of unpaid) {
      const on = addDays(i.dueOn, s.offset)
      if (on >= TODAY) dates.set(on, (dates.get(on) ?? 0) + 1)
    }
    const list = [...dates.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    return { ...s, list, count: list.reduce((n, [, c]) => n + c, 0) }
  })

  const history = db.reminders
    .filter(
      (r) =>
        !propertyId || db.invoices.find((i) => i.id === r.invoiceId)?.propertyId === propertyId,
    )
    .sort((a, b) => b.sentOn.localeCompare(a.sentOn))
  const historyRows = history.filter((r) => historyFilter === 'all' || r.status === historyFilter)

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  function sendNow() {
    if (!chosen.length) {
      toast.error('Pick at least one tenant to remind.')
      return
    }
    const n = sendReminders(
      chosen.map((i) => i.id),
      channel,
      person.name,
    )
    toast.success(`${n} ${n === 1 ? 'reminder' : 'reminders'} sent on ${CHANNEL_WORD[channel]}`)
    setPicked(null)
  }

  function retry(id: string) {
    const r = db.reminders.find((x) => x.id === id)
    updateDb((d) => {
      const x = d.reminders.find((y) => y.id === id)
      if (!x) return
      x.status = 'sent'
      x.sentOn = TODAY
      x.channel = x.channel === 'whatsapp' ? 'sms' : x.channel
      logActivity(d, {
        kind: 'rent',
        by: person.name,
        action: `Sent the rent reminder again by ${CHANNEL_WORD[x.channel]}`,
        target: d.tenants.find((t) => t.id === x.tenantId)?.name ?? '',
      })
    })
    toast.success(
      `Reminder sent again${r?.channel === 'whatsapp' ? ' by SMS (WhatsApp didn’t reach them)' : ''}`,
    )
  }

  return (
    <div>
      <PageHeader
        title="Rent reminders"
        description="Friendly reminders on WhatsApp and SMS so you don’t have to chase anyone."
        actions={<PropertyPicker value={propertyId} onChange={setPropertyId} />}
      />

      <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Section
          title="Automatic reminders"
          actions={
            <Badge tone={settings.autoReminders ? 'good' : 'neutral'} dot>
              {settings.autoReminders ? 'On' : 'Off'}
            </Badge>
          }
        >
          <ul className="grid gap-2.5 text-sm">
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">Sent by</span>
              <span className="font-medium">
                {settings.reminderChannels.map((c) => CHANNEL_WORD[c]).join(' and ')}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">First reminder</span>
              <span className="font-medium">
                {settings.reminderBeforeDays} days before the due date
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">Late fee</span>
              <span className="font-medium">
                {formatMoney(settings.lateFeePerDay)} a day after {settings.lateFeeAfterDays} days
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">UPI ID in the message</span>
              <span className="font-mono text-[13px]">{settings.upiId}</span>
            </li>
          </ul>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link to="/app/settings">
              <Settings2 /> Change in Settings
            </Link>
          </Button>
        </Section>

        <Section title="Coming up" description={`${unpaid.length} unpaid bills this month`}>
          <ol className="grid gap-3">
            {schedule.map((s, idx) => (
              <li key={s.label} className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.list.length
                      ? s.list
                          .map(
                            ([on, c]) => `${formatDate(on)}${on === TODAY ? ' (today)' : ''}: ${c}`,
                          )
                          .join(' · ')
                      : 'Nothing left to send this month'}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{s.count}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <Section
        title="Late payers"
        description={`${overdue.length} ${overdue.length === 1 ? 'tenant is' : 'tenants are'} past the due date · ${formatMoney(overdue.reduce((s, i) => s + balance(i), 0))}`}
        className="mb-6"
        bodyClassName="p-0"
        actions={
          collect &&
          overdue.length > 0 && (
            <>
              <Segmented
                label="Send by"
                value={channel}
                onChange={setChannel}
                options={[
                  { value: 'whatsapp', label: 'WhatsApp' },
                  { value: 'sms', label: 'SMS' },
                  { value: 'email', label: 'Email' },
                ]}
              />
              <Button onClick={sendNow} disabled={!chosen.length}>
                <Send /> Send now ({chosen.length})
              </Button>
            </>
          )
        }
      >
        {overdue.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<CheckCheck />} title="No one is late">
              Everyone with a bill past its due date has paid.
            </EmptyState>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1.4fr_1fr]">
            <ul className="divide-y lg:border-r">
              {collect && (
                <li className="flex items-center gap-3 bg-secondary/40 px-5 py-2 text-xs text-muted-foreground">
                  <Checkbox
                    aria-label="Select everyone"
                    checked={
                      chosen.length === overdue.length
                        ? true
                        : chosen.length
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={() =>
                      setPicked(
                        chosen.length === overdue.length
                          ? new Set()
                          : new Set(overdue.map((i) => i.id)),
                      )
                    }
                  />
                  {chosen.length} of {overdue.length} chosen
                </li>
              )}
              {overdue.map((i) => {
                const t = db.tenants.find((x) => x.id === i.tenantId)
                const last = db.reminders.find((r) => r.invoiceId === i.id)
                return (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                    {collect && (
                      <Checkbox
                        aria-label={`Remind ${t?.name}`}
                        checked={selected.has(i.id)}
                        onCheckedChange={() => toggle(i.id)}
                      />
                    )}
                    <Avatar name={t?.name ?? '?'} hue={t?.photoHue} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/app/tenants/${t?.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {t?.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {placeLabel(db, t)} ·{' '}
                        {last ? `last reminded ${formatDate(last.sentOn)}` : 'not reminded yet'}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money value={balance(i)} className="text-sm font-semibold" />
                      <p className="text-xs font-medium text-red-700">{daysLate(i)} days late</p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="border-t p-5 lg:border-t-0">
              <p className="mb-2 text-[13px] font-medium">
                Message preview{sampleTenant ? ` for ${sampleTenant.name}` : ''}
              </p>
              {sample && sampleTenant && (
                <ReminderPreview
                  text={reminderText({
                    name: sampleTenant.name,
                    amount: balance(sample),
                    period: sample.period,
                    dueOn: sample.dueOn,
                    upiId: settings.upiId,
                    business: db.business.name,
                    lateDays: daysLate(sample),
                  })}
                />
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Each tenant gets their own name, amount and days late.
              </p>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Sent reminders"
        description={`${history.length} reminders · latest first`}
        bodyClassName="p-0"
      >
        <div className="border-b px-5 py-3">
          <FilterChips
            label="Reminder status"
            value={historyFilter}
            onChange={setHistoryFilter}
            options={[
              { value: 'all', label: 'All', count: history.length },
              ...(Object.keys(REMINDER_STATUS) as Reminder['status'][]).map((s) => ({
                value: s,
                label: REMINDER_STATUS[s].label,
                count: history.filter((r) => r.status === s).length,
              })),
            ]}
          />
        </div>
        {historyRows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No reminders match.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Tenant</TH>
                <TH>When</TH>
                <TH>Type</TH>
                <TH>Sent by</TH>
                <TH>Status</TH>
                <TH className="text-right">Bill</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {historyRows.map((r) => {
                const t = db.tenants.find((x) => x.id === r.tenantId)
                const inv = db.invoices.find((i) => i.id === r.invoiceId)
                const s = REMINDER_STATUS[r.status]
                return (
                  <TR key={r.id}>
                    <TD className="font-medium whitespace-nowrap">
                      <Link to={`/app/tenants/${r.tenantId}`} className="hover:underline">
                        {t?.name ?? '—'}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(r.sentOn)}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {KIND_LABEL[r.kind]}
                    </TD>
                    <TD>{CHANNEL_WORD[r.channel].replace(/^e/, 'E')}</TD>
                    <TD>
                      <Badge tone={s.tone} dot>
                        {s.label}
                      </Badge>
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      {inv ? (
                        <Link to={`/app/rent/${inv.id}`} className="text-primary hover:underline">
                          {inv.number}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-right">
                      {r.status === 'failed' && collect && (
                        <Button size="sm" variant="outline" onClick={() => retry(r.id)}>
                          <RotateCcw /> Retry
                        </Button>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Section>
      {!settings.autoReminders && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4" /> Automatic reminders are off. Turn them on in
          Settings.
        </p>
      )}
    </div>
  )
}
