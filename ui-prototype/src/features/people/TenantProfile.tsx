import {
  ArrowRightLeft,
  BadgeCheck,
  CalendarClock,
  ChevronLeft,
  FileSignature,
  IndianRupee,
  LogIn,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Receipt,
  Send,
  ShieldCheck,
  StickyNote,
  Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { Avatar, DetailList, LineTabs, Money, Section, Status } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Alert, EmptyState, StatCard } from '../../components/ui-kit/feedback'
import { Textarea } from '../../components/ui-kit/input'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui-kit/menu'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import {
  COMPLAINT_CATEGORY,
  COMPLAINT_STATUS,
  INVOICE_STATUS,
  PAY_MODE,
  TENANT_STATUS,
  balance,
  daysLate,
  placeLabel,
  propertyName,
  floorName,
} from '../../data/selectors'
import { logActivity, updateDb, useDb } from '../../data/store'
import type { Tenant } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney, formatMonth, relativeTime } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { DepositDialog } from './deposit-dialogs'
import type { DepositAction } from './deposit-dialogs'
import { KYC, TODAY, maskId, noteLine, parseNotes, telLink, tenure, waLink } from './lib'
import { ReceiptDialog } from './money-dialogs'
import { TenantActionDialogs } from './tenant-dialogs'
import type { TenantAction } from './tenant-dialogs'

type Tab = 'overview' | 'stay' | 'rent' | 'deposit' | 'documents' | 'complaints' | 'notes'

export function TenantProfile() {
  const { id = '' } = useParams()
  const t = useDb((db) => db.tenants.find((x) => x.id === id))
  useBreadcrumbs([{ label: 'Tenants', to: '/app/tenants' }, { label: t?.name ?? 'Not found' }])
  if (!t)
    return (
      <EmptyState
        title="This tenant isn’t here"
        actions={
          <Button asChild>
            <Link to="/app/tenants">Back to tenants</Link>
          </Button>
        }
      >
        They may have been removed, or the link is wrong.
      </EmptyState>
    )
  return <Profile key={t.id} t={t} />
}

function Profile({ t }: { t: Tenant }) {
  const { can } = useSession()
  const db = useDb((d) => d)
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [action, setAction] = useState<TenantAction>(null)
  const [deposit, setDeposit] = useState<DepositAction>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const money = can('rent.view')
  const manage = can('tenants.manage')
  const live = t.status !== 'moved_out'

  const bills = useMemo(
    () =>
      db.invoices
        .filter((i) => i.tenantId === t.id)
        .sort((a, b) => b.period.localeCompare(a.period) || b.issuedOn.localeCompare(a.issuedOn)),
    [db.invoices, t.id],
  )
  const pays = useMemo(
    () =>
      db.payments
        .filter((p) => p.tenantId === t.id)
        .sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
    [db.payments, t.id],
  )
  const complaints = db.complaints.filter((c) => c.tenantId === t.id)
  const due = bills.reduce((s, i) => s + balance(i), 0)
  const oldestLate = bills
    .filter((i) => i.status === 'overdue')
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0]
  const notes = parseNotes(t.notes)
  const act = (kind: NonNullable<TenantAction>['kind']) => setAction({ kind, tenantId: t.id })

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'stay', label: 'Stay' },
    ...(money
      ? ([
          {
            value: 'rent',
            label: 'Rent & payments',
            count: bills.filter((b) => b.status !== 'paid').length || undefined,
          },
          { value: 'deposit', label: 'Deposit' },
        ] as const)
      : []),
    { value: 'documents', label: 'Documents & ID' },
    { value: 'complaints', label: 'Complaints', count: complaints.length },
    { value: 'notes', label: 'Notes', count: notes.length },
  ]

  return (
    <div>
      <Link
        to="/app/tenants"
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Tenants
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={t.name} hue={t.photoHue} size="xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{t.name}</h1>
              <Status of={TENANT_STATUS} value={t.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {placeLabel(db, t)} · {propertyName(db, t.propertyId)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={telLink(t.phone)}>
                  <Phone /> {t.phone}
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={waLink(t.phone)} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {money && can('rent.collect') && due > 0 && (
            <Button onClick={() => act('pay')}>
              <IndianRupee /> Record payment
            </Button>
          )}
          {manage && t.status === 'upcoming' && (
            <Button onClick={() => act('movein')}>
              <LogIn /> Mark as moved in
            </Button>
          )}
          {manage && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="outline">
                  <MoreHorizontal /> More
                </Button>
              </MenuTrigger>
              <MenuContent>
                {live && (
                  <MenuItem icon={<ArrowRightLeft />} onSelect={() => act('move')}>
                    Move to another bed
                  </MenuItem>
                )}
                {t.status === 'active' && (
                  <MenuItem icon={<CalendarClock />} onSelect={() => act('notice')}>
                    Give notice
                  </MenuItem>
                )}
                {t.status === 'notice' && (
                  <MenuItem icon={<CalendarClock />} onSelect={() => act('cancel_notice')}>
                    Cancel notice
                  </MenuItem>
                )}
                <MenuItem icon={<Pencil />} onSelect={() => act('edit')}>
                  Edit details
                </MenuItem>
                {(t.status === 'active' || t.status === 'notice') && (
                  <MenuItem icon={<LogOut />} destructive onSelect={() => act('checkout')}>
                    Check out
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>

      {t.status === 'notice' && (
        <Alert tone="warn" className="mb-5" title={`Moving out on ${formatDate(t.moveOutOn)}`}>
          Notice given on {formatDate(t.noticeGivenOn)}. Plan the check-out and deposit refund.
        </Alert>
      )}
      {t.status === 'upcoming' && (
        <Alert tone="info" className="mb-5" title={`Moving in on ${formatDate(t.checkIn)}`}>
          The bed is reserved. Mark as moved in when they arrive.
        </Alert>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {money && (
          <StatCard
            label="Monthly rent"
            value={formatMoney(t.rent)}
            hint={t.food ? 'With food' : 'Without food'}
          />
        )}
        {money && (
          <StatCard
            label="Balance due"
            value={<span className={cn(due > 0 && 'text-red-700')}>{formatMoney(due)}</span>}
            hint={
              oldestLate
                ? `${daysLate(oldestLate)} days late on ${formatMonth(oldestLate.period)}`
                : due > 0
                  ? 'Not late yet'
                  : 'All bills paid'
            }
          />
        )}
        {money && (
          <StatCard
            label="Deposit held"
            value={formatMoney(t.depositPaid)}
            hint={
              t.depositPaid < t.deposit && live
                ? `${formatMoney(t.deposit - t.depositPaid)} still to pay`
                : `of ${formatMoney(t.deposit)} agreed`
            }
          />
        )}
        <StatCard
          label={t.status === 'upcoming' ? 'Moving in' : 'Staying since'}
          value={<span className="text-lg">{formatDate(t.checkIn)}</span>}
          hint={
            t.status === 'upcoming'
              ? 'Bed reserved'
              : `${tenure(t.checkIn, t.status === 'moved_out' ? (t.moveOutOn ?? TODAY) : TODAY)}${t.status === 'moved_out' ? ' stay' : ''}`
          }
        />
        {!money && (
          <StatCard
            label="Complaints"
            value={complaints.length}
            hint={`${complaints.filter((c) => c.status === 'open' || c.status === 'in_progress').length} open`}
          />
        )}
      </div>

      <LineTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Personal">
            <DetailList
              cols={2}
              items={[
                ['Mobile', t.phone],
                ['Email', t.email],
                ['Gender', t.gender === 'female' ? 'Female' : 'Male'],
                ['Date of birth', t.dob ? formatDate(t.dob) : ''],
                ['Home town', t.homeCity],
                ['Food', t.food ? 'Takes food' : 'No food'],
              ]}
            />
          </Section>
          <Section title="Work or study">
            <DetailList
              cols={2}
              items={[
                ['Works or studies', t.occupation === 'student' ? 'Student' : 'Working'],
                [t.occupation === 'student' ? 'College' : 'Company', t.organisation],
              ]}
            />
          </Section>
          <Section title="Emergency contact">
            <DetailList
              cols={2}
              items={[
                ['Name', t.emergencyName],
                ['Relation', t.emergencyRelation],
                [
                  'Phone',
                  t.emergencyPhone ? (
                    <a href={telLink(t.emergencyPhone)} className="text-primary hover:underline">
                      {t.emergencyPhone}
                    </a>
                  ) : (
                    ''
                  ),
                ],
              ]}
            />
          </Section>
          <Section title="Vehicle & parking">
            <DetailList
              cols={2}
              items={[
                ['Vehicle number', t.vehicle ?? 'No vehicle'],
                ['Parking', t.vehicle ? 'Two-wheeler parking' : '—'],
              ]}
            />
          </Section>
        </div>
      )}

      {tab === 'stay' && <StayTab t={t} />}

      {tab === 'rent' && money && (
        <div className="grid gap-5">
          <Section
            title="Bills"
            description={`${bills.length} bills · ${formatMoney(due)} due`}
            bodyClassName="p-0"
            actions={
              can('rent.collect') &&
              due > 0 && (
                <Button size="sm" onClick={() => act('pay')}>
                  <IndianRupee /> Record payment
                </Button>
              )
            }
          >
            {bills.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No bills yet.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Month</TH>
                    <TH>Bill</TH>
                    <TH className="text-right">Total</TH>
                    <TH className="text-right">Paid</TH>
                    <TH className="text-right">Balance</TH>
                    <TH>Due</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {bills.map((i) => (
                    <TR
                      key={i.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/app/rent/${i.id}`)}
                    >
                      <TD className="font-medium whitespace-nowrap">{formatMonth(i.period)}</TD>
                      <TD>
                        <Link
                          to={`/app/rent/${i.id}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {i.number}
                        </Link>
                      </TD>
                      <TD className="text-right">
                        <Money value={i.total} />
                      </TD>
                      <TD className="text-right">
                        <Money value={i.paid} />
                      </TD>
                      <TD className="text-right font-medium">
                        <Money value={balance(i)} />
                      </TD>
                      <TD className="whitespace-nowrap">
                        {formatDate(i.dueOn)}
                        {daysLate(i) > 0 && (
                          <span className="block text-xs text-red-700">
                            {daysLate(i)} days late
                          </span>
                        )}
                      </TD>
                      <TD>
                        <Status of={INVOICE_STATUS} value={i.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>
          <Section
            title="Payments"
            description={`${pays.length} payments · ${formatMoney(pays.reduce((s, p) => s + p.amount, 0))} in total`}
            bodyClassName="p-0"
          >
            {pays.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Receipt</TH>
                    <TH>Date</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Paid by</TH>
                    <TH>Reference</TH>
                  </tr>
                </THead>
                <TBody>
                  {pays.map((p) => (
                    <TR key={p.id} className="cursor-pointer" onClick={() => setReceiptId(p.id)}>
                      <TD className="font-medium text-primary">{p.receipt}</TD>
                      <TD className="whitespace-nowrap">{formatDate(p.paidOn)}</TD>
                      <TD className="text-right font-medium">
                        <Money value={p.amount} />
                      </TD>
                      <TD>{PAY_MODE[p.mode]}</TD>
                      <TD className="text-xs text-muted-foreground">{p.reference || '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>
        </div>
      )}

      {tab === 'deposit' && money && (
        <DepositTab
          t={t}
          onCollect={() => setDeposit({ kind: 'collect', tenantId: t.id })}
          onRefund={() => setDeposit({ kind: 'refund', tenantId: t.id })}
          onCheckout={() => act('checkout')}
        />
      )}

      {tab === 'documents' && <DocumentsTab t={t} />}

      {tab === 'complaints' &&
        (complaints.length === 0 ? (
          <EmptyState icon={<Wrench />} title="No complaints">
            {t.name.split(' ')[0]} hasn’t raised any complaints.
          </EmptyState>
        ) : (
          <div className="grid gap-2">
            {complaints.map((c) => (
              <Link
                key={c.id}
                to={`/app/complaints/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.number} · {COMPLAINT_CATEGORY[c.category]} · raised {formatDate(c.raisedOn)}
                    {c.assignedTo ? ` · ${c.assignedTo}` : ''}
                  </p>
                </div>
                <Status of={COMPLAINT_STATUS} value={c.status} />
              </Link>
            ))}
          </div>
        ))}

      {tab === 'notes' && <NotesTab t={t} />}

      <TenantActionDialogs action={action} onClose={() => setAction(null)} />
      <DepositDialog action={deposit} onClose={() => setDeposit(null)} />
      {receiptId && <ReceiptDialog paymentId={receiptId} onClose={() => setReceiptId(null)} />}
    </div>
  )
}

/* ---------------------------------------------------------------- stay */

function StayTab({ t }: { t: Tenant }) {
  const db = useDb((d) => d)
  const navigate = useNavigate()
  const bed = db.beds.find((b) => b.id === t.bedId)
  const room = db.rooms.find((r) => r.id === bed?.roomId)
  const property = db.properties.find((p) => p.id === t.propertyId)
  const events: { on: string; title: string; detail?: string; icon: ReactNode }[] = [
    {
      on: t.checkIn,
      title: t.status === 'upcoming' ? 'Bed reserved' : 'Checked in',
      detail: property?.name,
      icon: <LogIn />,
    },
    ...db.activity
      .filter(
        (a) =>
          a.target === t.name &&
          a.kind === 'tenant' &&
          !/^Checked (in|out)|Recorded notice/.test(a.action),
      )
      .map((a) => ({
        on: a.at.slice(0, 10),
        title: a.action,
        detail: `by ${a.by}`,
        icon: <ArrowRightLeft />,
      })),
    ...(t.noticeGivenOn
      ? [
          {
            on: t.noticeGivenOn,
            title: 'Gave notice',
            detail: `Moving out on ${formatDate(t.moveOutOn)}`,
            icon: <CalendarClock />,
          },
        ]
      : []),
    ...(t.status === 'moved_out' && t.moveOutOn
      ? [{ on: t.moveOutOn, title: 'Checked out', icon: <LogOut /> }]
      : []),
  ].sort((a, b) => b.on.localeCompare(a.on))

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Section title="Current place">
        {bed && room ? (
          <>
            <DetailList
              cols={2}
              items={[
                ['Property', property?.name],
                ['Place', placeLabel(db, t)],
                ['Floor', floorName(room.floor)],
                [
                  'Room type',
                  `${room.sharing === 1 ? 'Single' : `${room.sharing} sharing`}${room.ac ? ' · AC' : ''}${room.attachedBath ? ' · Attached bath' : ''}`,
                ],
                [
                  'Room-mates',
                  db.beds
                    .filter((b) => b.roomId === room.id && b.id !== bed.id && b.tenantId)
                    .map((b) => db.tenants.find((x) => x.id === b.tenantId)?.name)
                    .filter(Boolean)
                    .join(', ') || 'None',
                ],
                ['Notice period', `${property?.noticeDays ?? 30} days`],
              ]}
            />
            <Button
              variant="link"
              className="mt-3"
              onClick={() => navigate(`/app/properties/${t.propertyId}`)}
            >
              Open {property?.name}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t.status === 'moved_out'
              ? `Moved out on ${formatDate(t.moveOutOn)}.`
              : 'No bed given yet.'}
          </p>
        )}
      </Section>
      <Section title="History">
        <ol className="relative grid gap-5 border-l pl-6">
          {events.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute top-0 -left-[37px] flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground [&_svg]:size-3.5">
                {e.icon}
              </span>
              <p className="text-sm font-medium">{e.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(e.on)}
                {e.detail ? ` · ${e.detail}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}

/* ---------------------------------------------------------------- deposit */

function DepositTab({
  t,
  onCollect,
  onRefund,
  onCheckout,
}: {
  t: Tenant
  onCollect: () => void
  onRefund: () => void
  onCheckout: () => void
}) {
  const { can } = useSession()
  const activity = useDb((db) => db.activity)
  const invoices = useDb((db) => db.invoices)
  const history = activity.filter((a) => a.target === t.name && /deposit/i.test(a.action))
  const adjusted = invoices
    .filter((i) => i.tenantId === t.id)
    .flatMap((i) =>
      i.lines
        .filter((l) => l.label === 'Adjusted from deposit')
        .map((l) => ({ inv: i, amount: -l.amount })),
    )
  const damages = invoices
    .filter((i) => i.tenantId === t.id)
    .flatMap((i) => i.lines.filter((l) => l.label.startsWith('Damage')))
  const pending = Math.max(0, t.deposit - t.depositPaid)
  const collect = can('rent.collect')
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Section
        title="Deposit"
        actions={
          collect && (
            <>
              {pending > 0 && t.status !== 'moved_out' && (
                <Button size="sm" variant="outline" onClick={onCollect}>
                  Record deposit payment
                </Button>
              )}
              {t.depositPaid > 0 && (
                <Button size="sm" variant="outline" onClick={onRefund}>
                  Refund
                </Button>
              )}
            </>
          )
        }
      >
        <div className="grid grid-cols-3 gap-3 text-center">
          <Figure label="Agreed" value={formatMoney(t.deposit)} />
          <Figure label="Held" value={formatMoney(t.depositPaid)} />
          <Figure
            label="Still to pay"
            value={formatMoney(t.status === 'moved_out' ? 0 : pending)}
            tone={pending > 0 && t.status !== 'moved_out' ? 'bad' : undefined}
          />
        </div>
        {t.status === 'notice' && (
          <Alert
            tone="info"
            className="mt-4"
            title="Refund at check-out"
            actions={
              can('tenants.manage') && (
                <Button size="sm" onClick={onCheckout}>
                  Check out
                </Button>
              )
            }
          >
            The check-out takes pending rent and damages from the deposit and shows the refund.
          </Alert>
        )}
      </Section>
      <Section title="Deductions and refunds">
        {history.length === 0 && adjusted.length === 0 && damages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.status === 'moved_out'
              ? 'Settled at check-out.'
              : 'Nothing taken from the deposit so far.'}
          </p>
        ) : (
          <ul className="divide-y">
            {damages.map((l, i) => (
              <li key={`d${i}`} className="flex justify-between gap-3 py-2 text-sm">
                <span>{l.label}</span>
                <Money value={l.amount} className="font-medium text-red-700" />
              </li>
            ))}
            {adjusted.map((a) => (
              <li key={a.inv.id} className="flex justify-between gap-3 py-2 text-sm">
                <span>
                  Used for {formatMonth(a.inv.period)} bill ({a.inv.number})
                </span>
                <Money value={a.amount} className="font-medium" />
              </li>
            ))}
            {history.map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <p>{a.action}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(a.at.slice(0, 10))} · {a.by}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg bg-secondary/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-base font-semibold tabular-nums sm:text-lg',
          tone === 'bad' && 'text-red-700',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- documents */

function DocumentsTab({ t }: { t: Tenant }) {
  const { can, person } = useSession()
  const manage = can('tenants.manage')
  const seeId = can('tenants.id_documents')
  const [type, last4 = ''] = t.idType.split(' · ')
  const pseudoLast4 =
    last4 || (t.kyc === 'missing' ? '' : String(1000 + ((t.name.length * 733) % 9000)).slice(0, 4))
  const police = t.notes.includes('Police verification') || t.kyc === 'verified'
  const hasCopies = t.kyc !== 'missing'

  function update(change: (x: Tenant) => void, msg: string, action: string) {
    updateDb((d) => {
      const x = d.tenants.find((y) => y.id === t.id)
      if (!x) return
      change(x)
      logActivity(d, {
        kind: 'tenant',
        by: person.name,
        action,
        target: x.name,
        propertyId: x.propertyId,
      })
    })
    toast.success(msg)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section
        title="ID proof"
        description={`${type ?? 'ID'} · ${maskId(type ?? '', pseudoLast4)}`}
        actions={<Status of={KYC} value={t.kyc} />}
      >
        <div className="grid grid-cols-2 gap-3">
          {['Front', 'Back'].map((side, i) => (
            <div key={side} className="relative overflow-hidden rounded-lg border">
              {hasCopies ? (
                <div
                  className={cn(
                    'flex aspect-[3/2] flex-col justify-between p-3 text-[10px] text-slate-600',
                    !seeId && 'blur-sm',
                  )}
                  style={{
                    background: `linear-gradient(135deg, oklch(0.95 0.03 ${t.photoHue}), oklch(0.88 0.05 ${t.photoHue + 30}))`,
                  }}
                >
                  <span className="font-semibold tracking-wide uppercase">{type}</span>
                  {i === 0 ? (
                    <span className="flex items-end gap-2">
                      <span className="size-8 rounded bg-white/60" />
                      <span className="grid gap-1">
                        <span className="h-1.5 w-16 rounded bg-slate-500/40" />
                        <span className="h-1.5 w-10 rounded bg-slate-500/30" />
                      </span>
                    </span>
                  ) : (
                    <span className="h-1.5 w-20 rounded bg-slate-500/30" />
                  )}
                  <span className="font-mono text-xs tracking-widest text-slate-700">
                    {maskId(type ?? '', pseudoLast4)}
                  </span>
                </div>
              ) : (
                <div className="flex aspect-[3/2] items-center justify-center bg-secondary/40 text-xs text-muted-foreground">
                  Not uploaded
                </div>
              )}
              <span className="absolute right-1.5 bottom-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                {side}
              </span>
            </div>
          ))}
        </div>
        {!seeId && hasCopies && (
          <p className="mt-2 text-xs text-muted-foreground">
            You don’t have access to open ID copies.
          </p>
        )}
        {manage && (
          <div className="mt-4 flex flex-wrap gap-2">
            {t.kyc !== 'verified' && hasCopies && (
              <Button
                size="sm"
                onClick={() =>
                  update(
                    (x) => (x.kyc = 'verified'),
                    'ID marked as checked',
                    'Checked the ID proof',
                  )
                }
              >
                <BadgeCheck /> Mark ID as checked
              </Button>
            )}
            {t.kyc === 'missing' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  update(
                    (x) => (x.kyc = 'pending'),
                    'ID copies uploaded. Check them when you can.',
                    'Uploaded ID proof',
                  )
                }
              >
                Upload ID copies
              </Button>
            )}
            {t.kyc === 'missing' && (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={waLink(
                    t.phone,
                    `Hi ${t.name.split(' ')[0]}, please share a photo of your ID (masked Aadhaar, PAN or passport) for our records. Cover the first 8 digits of Aadhaar.`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle /> Ask on WhatsApp
                </a>
              </Button>
            )}
          </div>
        )}
      </Section>

      <Section title="Rental agreement" actions={<AgreementBadge value={t.agreement} />}>
        <p className="text-sm text-muted-foreground">
          {t.agreement === 'signed'
            ? `Signed. Covers rent, deposit, notice period and house rules.`
            : t.agreement === 'sent'
              ? 'Sent for e-sign on WhatsApp. Waiting for the tenant to sign.'
              : 'Not sent yet. Send it so the terms are clear for both sides.'}
        </p>
        {manage && (
          <div className="mt-4 flex flex-wrap gap-2">
            {t.agreement !== 'signed' && (
              <Button
                size="sm"
                variant={t.agreement === 'sent' ? 'outline' : 'default'}
                onClick={() =>
                  update(
                    (x) => (x.agreement = 'sent'),
                    t.agreement === 'sent'
                      ? `Reminder to sign sent to ${t.phone}`
                      : `Agreement sent to ${t.phone} on WhatsApp`,
                    t.agreement === 'sent'
                      ? 'Resent the agreement for e-sign'
                      : 'Sent the agreement for e-sign',
                  )
                }
              >
                <Send /> {t.agreement === 'sent' ? 'Resend' : 'Send for e-sign'}
              </Button>
            )}
            {t.agreement !== 'signed' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  update(
                    (x) => (x.agreement = 'signed'),
                    'Signed agreement uploaded',
                    'Uploaded the signed agreement',
                  )
                }
              >
                <FileSignature /> Upload signed copy
              </Button>
            )}
            {t.agreement === 'signed' && (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={waLink(
                    t.phone,
                    `Hi ${t.name.split(' ')[0]}, here is a copy of your signed rental agreement for your records.`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Receipt /> Share a copy on WhatsApp
                </a>
              </Button>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Police verification"
        actions={
          police ? (
            <Badge tone="good" dot>
              Form submitted
            </Badge>
          ) : (
            <Badge tone="warn" dot>
              Not done
            </Badge>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          Bengaluru City Police ask PG owners to keep a tenant verification form for every tenant.
          Fill it on the police website or at the local station.
        </p>
        {manage && !police && (
          <Button
            size="sm"
            className="mt-4"
            onClick={() =>
              update(
                (x) =>
                  (x.notes = [
                    x.notes,
                    noteLine(person.name, 'Police verification form filled and submitted.'),
                  ]
                    .filter(Boolean)
                    .join('\n')),
                'Police verification marked as done',
                'Submitted the police verification form',
              )
            }
          >
            <ShieldCheck /> Mark form submitted
          </Button>
        )}
      </Section>
    </div>
  )
}

function AgreementBadge({ value }: { value: Tenant['agreement'] }) {
  return value === 'signed' ? (
    <Badge tone="good" dot>
      Signed
    </Badge>
  ) : value === 'sent' ? (
    <Badge tone="info" dot>
      Waiting for signature
    </Badge>
  ) : (
    <Badge tone="warn" dot>
      Not sent
    </Badge>
  )
}

/* ---------------------------------------------------------------- notes */

function NotesTab({ t }: { t: Tenant }) {
  const { person } = useSession()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const notes = parseNotes(t.notes).reverse()
  function add() {
    if (!text.trim()) {
      setError('Type a note first.')
      return
    }
    updateDb((d) => {
      const x = d.tenants.find((y) => y.id === t.id)
      if (x) x.notes = [x.notes, noteLine(person.name, text.trim())].filter(Boolean).join('\n')
    })
    setText('')
    setError('')
    toast.success('Note added')
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <Section title="Add a note" description="Only your team sees notes.">
        <Textarea
          aria-label="Note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Asked for a room change to the 2nd floor"
          aria-invalid={error ? true : undefined}
        />
        {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
        <Button className="mt-3" onClick={add}>
          <StickyNote /> Add note
        </Button>
      </Section>
      <Section title="Notes">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="grid gap-3">
            {notes.map((n, i) => (
              <li key={i} className="rounded-lg border bg-secondary/30 p-3">
                <p className="text-sm">{n.text}</p>
                {n.on && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.by} ·{' '}
                    {n.on === TODAY
                      ? 'today'
                      : relativeTime(`${n.on}T12:00:00`, Date.parse(`${TODAY}T12:00:00`))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
