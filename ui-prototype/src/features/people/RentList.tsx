import {
  BellRing,
  CalendarCheck,
  Eye,
  FilePlus2,
  IndianRupee,
  MoreHorizontal,
  Receipt,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import {
  Avatar,
  FilterChips,
  Money,
  PropertyPicker,
  SearchBox,
  Status,
  Toolbar,
} from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, Meter, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui-kit/menu'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { INVOICE_STATUS, balance, daysLate, placeLabel, propertyName } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Invoice, InvoiceStatus } from '../../data/types'
import { useSession } from '../../demo/session'
import { formatDate, formatMoney, formatMonth } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { NoAccessGuard } from './guards'
import { LAST_MONTH, THIS_MONTH, TODAY, nextInvoiceNumber, sendReminders, statusFor } from './lib'
import { RecordPaymentDialog, SendRemindersDialog } from './money-dialogs'
import { SumRow } from './parts'

type Chip = 'all' | InvoiceStatus

export function RentList() {
  return (
    <NoAccessGuard perm="rent.view" what="rent and bills">
      <Rent />
    </NoAccessGuard>
  )
}

function Rent() {
  useBreadcrumbs([{ label: 'Rent & bills' }])
  const { can, person } = useSession()
  const navigate = useNavigate()
  const db = useDb((d) => d)
  const [params] = useSearchParams()
  const [period, setPeriod] = useState(params.get('month') === LAST_MONTH ? LAST_MONTH : THIS_MONTH)
  const [chip, setChip] = useState<Chip>(() => {
    const s = params.get('status')
    return s && s in INVOICE_STATUS ? (s as InvoiceStatus) : 'all'
  })
  const [propertyId, setPropertyId] = useState('')
  const [q, setQ] = useState('')
  const [payFor, setPayFor] = useState<string | null>(null)
  const [remindAll, setRemindAll] = useState(false)
  const [generate, setGenerate] = useState(false)
  const collect = can('rent.collect')

  const monthBills = useMemo(
    () =>
      db.invoices.filter(
        (i) => i.period === period && (!propertyId || i.propertyId === propertyId),
      ),
    [db.invoices, period, propertyId],
  )
  const expected = monthBills.reduce((s, i) => s + i.total, 0)
  const collected = monthBills.reduce((s, i) => s + i.paid, 0)
  const overdue = monthBills.filter((i) => i.status === 'overdue')
  const unpaid = monthBills.filter((i) => i.status !== 'paid')
  const count = (s: InvoiceStatus) => monthBills.filter((i) => i.status === s).length
  const tenantOf = (i: Invoice) => db.tenants.find((t) => t.id === i.tenantId)

  const needle = q.trim().toLowerCase()
  const rows = monthBills
    .filter((i) => chip === 'all' || i.status === chip)
    .filter((i) => {
      if (!needle) return true
      const t = tenantOf(i)
      return (
        i.number.toLowerCase().includes(needle) ||
        (t?.name.toLowerCase().includes(needle) ?? false) ||
        placeLabel(db, t).toLowerCase().includes(needle)
      )
    })
    .sort((a, b) => {
      const order = { overdue: 0, partly_paid: 1, due: 2, paid: 3 }
      return (
        order[a.status] - order[b.status] ||
        daysLate(b) - daysLate(a) ||
        (tenantOf(a)?.name ?? '').localeCompare(tenantOf(b)?.name ?? '')
      )
    })

  function remindOne(i: Invoice) {
    sendReminders([i.id], 'whatsapp', person.name)
    toast.success(`Reminder sent to ${tenantOf(i)?.name ?? 'tenant'} on WhatsApp`)
  }

  return (
    <div>
      <PageHeader
        title="Rent & bills"
        description="Who has paid, who hasn’t, and how much is still to come."
        actions={
          <>
            {collect && (
              <Button
                variant="outline"
                onClick={() => setRemindAll(true)}
                disabled={!unpaid.length}
              >
                <BellRing /> Send reminders to all unpaid
              </Button>
            )}
            {can('rent.adjust') || collect ? (
              <Button onClick={() => setGenerate(true)}>
                <FilePlus2 /> Generate {formatMonth(period).split(' ')[0]} bills
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          label="Month"
          value={period}
          onChange={setPeriod}
          options={[
            { value: LAST_MONTH, label: formatMonth(LAST_MONTH) },
            { value: THIS_MONTH, label: formatMonth(THIS_MONTH) },
          ]}
        />
        {period === THIS_MONTH && (
          <span className="text-[13px] text-muted-foreground">Today is {formatDate(TODAY)}</span>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Expected"
          value={formatMoney(expected)}
          hint={`${monthBills.length} bills`}
        />
        <StatCard
          label="Collected"
          value={<span className="text-emerald-700">{formatMoney(collected)}</span>}
          hint={`${count('paid')} fully paid`}
        />
        <StatCard
          label="Still to collect"
          value={formatMoney(expected - collected)}
          hint={`${unpaid.length} bills not fully paid`}
        />
        <StatCard
          label="Overdue"
          value={
            <span className={overdue.length ? 'text-red-700' : undefined}>{overdue.length}</span>
          }
          hint={`${formatMoney(overdue.reduce((s, i) => s + balance(i), 0))} late`}
        />
        <StatCard
          label="Collected so far"
          value={`${expected ? Math.round((collected / expected) * 100) : 0}%`}
          hint=" "
        >
          <div className="-mt-2">
            <Meter value={collected} max={expected} label="Rent collected" />
          </div>
        </StatCard>
      </div>

      <Toolbar>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search tenant, room or bill number"
          className="max-w-sm"
        />
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
      </Toolbar>
      <div className="mb-4">
        <FilterChips
          label="Bill status"
          value={chip}
          onChange={setChip}
          options={[
            { value: 'all', label: 'All', count: monthBills.length },
            { value: 'overdue', label: 'Overdue', count: count('overdue') },
            { value: 'due', label: 'Due', count: count('due') },
            { value: 'partly_paid', label: 'Partly paid', count: count('partly_paid') },
            { value: 'paid', label: 'Paid', count: count('paid') },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={needle ? `Nothing matches “${q}”` : 'No bills here'}
          actions={
            <Button
              variant="outline"
              onClick={() => {
                setQ('')
                setChip('all')
                setPropertyId('')
              }}
            >
              Clear filters
            </Button>
          }
        >
          {chip === 'overdue' ? 'No one is late. Nice!' : 'Try another month, status or property.'}
        </EmptyState>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Tenant</TH>
                  <TH>Bill</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Paid</TH>
                  <TH className="text-right">Balance</TH>
                  <TH>Due</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((i) => {
                  const t = tenantOf(i)
                  const late = daysLate(i)
                  return (
                    <TR
                      key={i.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/app/rent/${i.id}`)}
                    >
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={t?.name ?? '?'} hue={t?.photoHue} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium">{t?.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {placeLabel(db, t)} · {propertyName(db, i.propertyId)}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD className="text-[13px] text-muted-foreground">{i.number}</TD>
                      <TD className="text-right">
                        <Money value={i.total} />
                      </TD>
                      <TD className="text-right text-muted-foreground">
                        <Money value={i.paid} />
                      </TD>
                      <TD className="text-right font-semibold">
                        <Money value={balance(i)} />
                      </TD>
                      <TD className="whitespace-nowrap">
                        {formatDate(i.dueOn)}
                        {late > 0 && (
                          <span className="block text-xs font-medium text-red-700">
                            {late} {late === 1 ? 'day' : 'days'} late
                          </span>
                        )}
                      </TD>
                      <TD>
                        <Status of={INVOICE_STATUS} value={i.status} />
                      </TD>
                      <TD onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {collect && i.status !== 'paid' && (
                            <Button size="sm" variant="outline" onClick={() => setPayFor(i.id)}>
                              Record payment
                            </Button>
                          )}
                          <BillMenu
                            i={i}
                            collect={collect}
                            onRemind={() => remindOne(i)}
                            onView={() => navigate(`/app/rent/${i.id}`)}
                          />
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
          <div className="grid gap-2 md:hidden">
            {rows.map((i) => {
              const t = tenantOf(i)
              const late = daysLate(i)
              return (
                <div
                  key={i.id}
                  className="rounded-xl border bg-card p-3 shadow-xs"
                  onClick={() => navigate(`/app/rent/${i.id}`)}
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={t?.name ?? '?'} hue={t?.photoHue} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {placeLabel(db, t)} · {i.number}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money value={balance(i)} className="font-semibold" />
                      <p className="text-[11px] text-muted-foreground">of {formatMoney(i.total)}</p>
                    </div>
                  </div>
                  <div
                    className="mt-2 flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Status of={INVOICE_STATUS} value={i.status} />
                    <span className="text-xs text-muted-foreground">
                      {late > 0 ? `${late} days late` : `Due ${formatDate(i.dueOn)}`}
                    </span>
                    <div className="ml-auto flex gap-1">
                      {collect && i.status !== 'paid' && (
                        <Button size="sm" variant="outline" onClick={() => setPayFor(i.id)}>
                          <IndianRupee /> Pay
                        </Button>
                      )}
                      <BillMenu
                        i={i}
                        collect={collect}
                        onRemind={() => remindOne(i)}
                        onView={() => navigate(`/app/rent/${i.id}`)}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {rows.length} of {monthBills.length} bills for {formatMonth(period)}
          </p>
        </>
      )}

      {payFor && <RecordPaymentDialog invoiceId={payFor} onClose={() => setPayFor(null)} />}
      {remindAll && (
        <SendRemindersDialog
          invoiceIds={unpaid.map((i) => i.id)}
          title={`Remind everyone who hasn’t paid for ${formatMonth(period)}`}
          onClose={() => setRemindAll(false)}
        />
      )}
      {generate && <GenerateDialog period={period} onClose={() => setGenerate(false)} />}
    </div>
  )
}

function BillMenu({
  i,
  collect,
  onRemind,
  onView,
}: {
  i: Invoice
  collect: boolean
  onRemind: () => void
  onView: () => void
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`More for ${i.number}`}>
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {collect && i.status !== 'paid' && (
          <MenuItem icon={<BellRing />} onSelect={onRemind}>
            Send reminder
          </MenuItem>
        )}
        <MenuItem icon={<Eye />} onSelect={onView}>
          View bill
        </MenuItem>
        <MenuItem asChild>
          <Link to={`/app/tenants/${i.tenantId}`}>
            <Users /> Open tenant
          </Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function GenerateDialog({ period, onClose }: { period: string; onClose: () => void }) {
  const { person } = useSession()
  const db = useDb((d) => d)
  const bills = db.invoices.filter((i) => i.period === period)
  const billed = new Set(bills.map((i) => i.tenantId))
  const missing = db.tenants.filter(
    (t) =>
      (t.status === 'active' || t.status === 'notice') &&
      !billed.has(t.id) &&
      t.checkIn <= `${period}-28`,
  )
  const total = bills.reduce((s, i) => s + i.total, 0)

  function make() {
    updateDb((d) => {
      for (const t of missing) {
        const prop = d.properties.find((p) => p.id === t.propertyId)
        const dueOn = `${period}-${String(prop?.rentDueDay ?? 5).padStart(2, '0')}`
        d.invoices.push({
          id: newId('inv'),
          number: nextInvoiceNumber(d, period),
          tenantId: t.id,
          propertyId: t.propertyId,
          period,
          issuedOn: TODAY,
          dueOn,
          lines: [{ label: 'Rent', amount: t.rent }],
          total: t.rent,
          paid: 0,
          status: statusFor({ total: t.rent, paid: 0, dueOn }),
        })
      }
      logActivity(d, {
        kind: 'rent',
        by: person.name,
        action: `Made ${missing.length} missing rent bills`,
        target: `${formatMonth(period)} rent`,
      })
    })
    toast.success(
      `${missing.length} new ${missing.length === 1 ? 'bill' : 'bills'} made for ${formatMonth(period)}`,
    )
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${formatMonth(period)} bills`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {missing.length > 0 && (
            <Button onClick={make}>
              Make {missing.length} missing {missing.length === 1 ? 'bill' : 'bills'}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4">
        <Alert tone="good" title="Already done">
          Bills for {formatMonth(period)} were made automatically on{' '}
          {formatDate(`${period}-${String(db.settings.billOnDay).padStart(2, '0')}`)} and sent to
          tenants on WhatsApp.
        </Alert>
        <div className="rounded-lg border p-3">
          <SumRow label="Bills made" value={String(bills.length)} />
          <SumRow label="Total billed" value={formatMoney(total)} strong />
        </div>
        {missing.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">
              {missing.length} {missing.length === 1 ? 'tenant has' : 'tenants have'} no bill for
              this month yet:
            </p>
            <ul className="divide-y rounded-lg border text-sm">
              {missing.map((t) => (
                <li key={t.id} className="flex justify-between px-3 py-2">
                  <span>{t.name}</span>
                  <Money value={t.rent} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarCheck className="size-4 text-emerald-600" /> Every staying tenant has a bill
            for this month.
          </p>
        )}
      </div>
    </Dialog>
  )
}
