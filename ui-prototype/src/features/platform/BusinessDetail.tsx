import {
  ArrowRight,
  BadgeCheck,
  Ban,
  CalendarPlus,
  ChevronDown,
  Eye,
  Gem,
  LogIn,
  MessageSquare,
  PlayCircle,
  ShieldAlert,
  StickyNote,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { Avatar, DetailList, Section, Status } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { NativeSelect, Textarea } from '../../components/ui-kit/input'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui-kit/menu'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { ROLE_INFO, TODAY } from '../../data/seed'
import { OWNER_CHECK, PROPERTY_STATUS } from '../../data/selectors'
import { updateDb, useDb } from '../../data/store'
import type { PlanCode } from '../../data/types'
import { useSession } from '../../demo/session'
import { formatDate, formatMoney, plural } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { updateExtras, useExtras } from './extras'
import {
  BUSINESS_STATUS,
  CHECK_STATUS,
  GATEWAY,
  PAYMENT_STATUS,
  PERSON_SHORT,
  PLAN_STATUS,
  addDays,
  daysAgo,
  daysBetween,
  formatDateTime,
  stamp,
} from './util'

type DialogName = 'trial' | 'plan' | 'suspend' | 'reactivate' | 'signin' | 'message' | null

export function BusinessDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { setRole } = useSession()
  const raw = useDb((db) => db.platformBusinesses.find((b) => b.id === id))
  const tenants = useDb((db) => db.tenants)
  const ownBusiness = useDb((db) => db.business)
  const properties = useDb((db) => db.properties)
  const beds = useDb((db) => db.beds)
  const members = useDb((db) => db.members)
  const allPayments = useDb((db) => db.platformPayments)
  const queue = useDb((db) => db.verificationQueue)
  const plans = useExtras((x) => x.plans)
  const trialEnd = useExtras((x) => x.trialEnds[id])
  const notes = useExtras((x) => x.notes[id])
  const messages = useExtras((x) => x.messages[id])
  const suspendReason = useExtras((x) => x.suspendReasons[id])
  const supportView = useExtras((x) => x.supportView)
  const [open, setOpen] = useState<DialogName>(null)
  const [note, setNote] = useState('')

  /** Asha Stays is the business whose full sample data lives in the prototype: show its real numbers. */
  const isSample = raw?.name === ownBusiness.name
  const biz = useMemo(
    () =>
      raw && isSample
        ? {
            ...raw,
            phone: ownBusiness.phone,
            city: properties[0]?.locality ?? raw.city,
            properties: properties.filter((p) => p.status !== 'archived').length,
            beds: beds.length,
            tenants: tenants.filter((t) => t.status === 'active' || t.status === 'notice').length,
          }
        : raw,
    [raw, isSample, ownBusiness.phone, properties, beds, tenants],
  )

  useBreadcrumbs([
    { label: 'Businesses', to: '/platform/businesses' },
    { label: biz?.name ?? 'Not found' },
  ])

  const payments = useMemo(
    () =>
      allPayments
        .filter((p) => p.business === biz?.name)
        .sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
    [allPayments, biz?.name],
  )
  const checks = useMemo(() => queue.filter((v) => v.business === biz?.name), [queue, biz?.name])

  if (!biz) {
    return (
      <EmptyState
        title="This business was not found"
        actions={
          <Button asChild variant="outline">
            <Link to="/platform/businesses">Back to businesses</Link>
          </Button>
        }
      >
        It may have been removed, or the link is wrong.
      </EmptyState>
    )
  }

  const plan = plans.find((p) => p.code === biz.plan)
  const planName = (code: string) => plans.find((p) => p.code === code)?.name ?? code
  const paid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const inSupportView = supportView === biz.id

  function addNote() {
    const text = note.trim()
    if (!text) return
    updateExtras((x) => {
      x.notes[id] = [{ at: stamp(), by: PERSON_SHORT, text }, ...(x.notes[id] ?? [])]
    })
    setNote('')
    toast.success('Note added')
  }

  return (
    <>
      {inSupportView && (
        <Alert
          tone="warn"
          className="mb-5"
          title={`Support view: you are signed in as ${biz.owner}`}
          actions={
            <>
              <Button
                size="sm"
                onClick={() => {
                  setRole('owner')
                  navigate('/app')
                }}
              >
                Open their app <ArrowRight />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  updateExtras((x) => {
                    x.supportView = null
                  })
                  toast.success('Left the support view')
                }}
              >
                Leave
              </Button>
            </>
          }
        >
          Everything you see and change is written to {biz.name}’s activity log. Do not change rent,
          tenants or payments unless the owner asked you to.
        </Alert>
      )}

      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{planName(biz.plan)} plan</Badge>
            <Status of={PLAN_STATUS} value={biz.planStatus} />
            <Status of={BUSINESS_STATUS} value={biz.status} />
          </div>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={biz.name} hue={(Number(biz.id.slice(1)) * 47) % 360} size="lg" />
            {biz.name}
          </span>
        }
        description={`${biz.owner} · ${biz.phone} · ${biz.city}, Bengaluru`}
        actions={
          <>
            <Button variant="outline" onClick={() => setOpen('message')}>
              <MessageSquare /> Send message
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpen('signin')}
              disabled={biz.status === 'suspended'}
            >
              <LogIn /> Sign in as owner
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button>
                  Actions <ChevronDown />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<CalendarPlus />} onSelect={() => setOpen('trial')}>
                  Extend free trial
                </MenuItem>
                <MenuItem icon={<Gem />} onSelect={() => setOpen('plan')}>
                  Change plan
                </MenuItem>
                <MenuSeparator />
                {biz.status === 'active' ? (
                  <MenuItem destructive icon={<Ban />} onSelect={() => setOpen('suspend')}>
                    Suspend account
                  </MenuItem>
                ) : (
                  <MenuItem icon={<PlayCircle />} onSelect={() => setOpen('reactivate')}>
                    Switch account back on
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          </>
        }
      />

      {biz.status === 'suspended' && (
        <Alert tone="bad" className="mb-5" title="This account is suspended">
          {suspendReason ?? 'No reason was recorded.'} The owner and their team can sign in but
          can’t change anything; tenants can’t see bills.
        </Alert>
      )}
      {biz.planStatus === 'trial' && trialEnd && (
        <Alert
          tone="info"
          className="mb-5"
          title={`Free trial of Pro ends on ${formatDate(trialEnd)}`}
        >
          {daysBetween(TODAY, trialEnd) > 0
            ? `${plural(daysBetween(TODAY, trialEnd), 'day')} left. After that the business falls back to Free unless the owner pays.`
            : 'The trial has ended today.'}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Section title="Business profile">
            <DetailList
              items={[
                ['Owner', biz.owner],
                ['Mobile', biz.phone],
                [
                  'Email',
                  isSample
                    ? ownBusiness.email
                    : `${biz.owner.split(' ')[0]?.toLowerCase()}@gmail.com`,
                ],
                ['Area', `${biz.city}, Bengaluru`],
                ['GST number', isSample ? ownBusiness.gstin : 'Not given'],
                ['Joined', formatDate(biz.joinedOn)],
                ['Last active', daysAgo(biz.lastActive)],
                [
                  'Email confirmed',
                  isSample ? (ownBusiness.emailConfirmed ? 'Yes' : 'Not yet') : 'Yes',
                ],
                ['Business ID', biz.id.toUpperCase()],
              ]}
            />
          </Section>

          <Section
            title="Plan & payments"
            description={
              plan
                ? `${formatMoney(plan.pricePerMonth)} a month · ${formatMoney(paid)} paid so far`
                : undefined
            }
            actions={
              <Button size="sm" variant="outline" onClick={() => setOpen('plan')}>
                Change plan
              </Button>
            }
            bodyClassName="p-0"
          >
            {plan && (
              <div className="grid gap-4 border-b p-5 sm:grid-cols-4">
                {(
                  [
                    ['Properties', biz.properties, plan.limits.properties],
                    ['Beds', biz.beds, plan.limits.beds],
                    ['Tenants', biz.tenants, plan.limits.tenants],
                    ['Team', isSample ? members.length : 1, plan.limits.team],
                  ] as const
                ).map(([label, used, limit]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">
                      {used}
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        / {limit ?? 'No limit'}
                      </span>
                    </p>
                    {limit !== null && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={
                            used > limit
                              ? 'h-full bg-red-500'
                              : used / limit > 0.85
                                ? 'h-full bg-amber-500'
                                : 'h-full bg-primary'
                          }
                          style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No plan payments yet – this business is on {planName(biz.plan)}.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Plan</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Paid with</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {payments.map((p) => (
                    <TR key={p.id}>
                      <TD className="whitespace-nowrap">{formatDate(p.paidOn)}</TD>
                      <TD>{planName(p.plan)}</TD>
                      <TD className="text-right tabular-nums">{formatMoney(p.amount)}</TD>
                      <TD>{GATEWAY[p.gateway]}</TD>
                      <TD>
                        <Status of={PAYMENT_STATUS} value={p.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>

          <Section
            title="Properties"
            description={`${plural(biz.properties, 'property', 'properties')} · ${plural(biz.beds, 'bed')} · ${plural(biz.tenants, 'tenant')}`}
            bodyClassName="p-0"
          >
            {isSample ? (
              <ul className="divide-y">
                {properties.map((p) => {
                  const here = beds.filter((b) => b.propertyId === p.id)
                  const o = {
                    beds: here.length,
                    filled: here.filter((b) => b.status === 'occupied' || b.status === 'notice')
                      .length,
                  }
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.reference} · {p.locality}
                        </p>
                      </div>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {o.filled}/{o.beds} beds filled
                      </span>
                      <Status of={PROPERTY_STATUS} value={p.status} />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <ul className="divide-y">
                {Array.from({ length: biz.properties }, (_, i) => {
                  const bedsHere = Math.round(biz.beds / biz.properties)
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {biz.name.replace(/ PG$/, '')}{' '}
                          {biz.properties > 1 ? `– Block ${'ABCDEFGHI'[i]}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">{biz.city}</p>
                      </div>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {bedsHere} beds
                      </span>
                      <Status of={PROPERTY_STATUS} value="active" />
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section title="Team" bodyClassName="p-0">
            <ul className="divide-y">
              {(isSample
                ? members
                : [
                    {
                      id: 'owner',
                      name: biz.owner,
                      phone: biz.phone,
                      role: 'owner' as const,
                      status: 'active' as const,
                    },
                  ]
              ).map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={m.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.phone}</p>
                  </div>
                  <Badge tone="outline">{ROLE_INFO[m.role].label}</Badge>
                  {m.status === 'invited' && <Badge tone="info">Invited</Badge>}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="Owner check" actions={<Status of={OWNER_CHECK} value={biz.ownerCheck} />}>
            <p className="text-sm text-muted-foreground">
              {biz.ownerCheck === 'approved'
                ? 'The owner’s ID was checked by our team. Their listings can show the “Owner verified” mark.'
                : biz.ownerCheck === 'not_started' || biz.ownerCheck === 'draft'
                  ? 'The owner has not sent an ID yet. This never blocks the app; only public listings need it.'
                  : 'Our team is looking at what the owner sent.'}
            </p>
            {checks.length > 0 && (
              <ul className="mt-4 grid gap-2">
                {checks.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/platform/verification/${c.id}`}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-secondary/60"
                    >
                      {c.kind === 'owner' ? (
                        <BadgeCheck className="size-4 text-muted-foreground" />
                      ) : (
                        <ShieldAlert className="size-4 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{c.subject}</span>
                        <span className="block text-xs text-muted-foreground">
                          {c.kind === 'owner' ? 'Owner check' : 'Property check'} · sent{' '}
                          {formatDate(c.submittedOn)}
                        </span>
                        <span className="mt-1.5 block">
                          <Status of={CHECK_STATUS} value={c.status} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Notes for our team" description="Only the PG Manager team sees these.">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                addNote()
              }}
              className="grid gap-2"
            >
              <Textarea
                aria-label="New note"
                placeholder="What did you talk about? What should the next person know?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex justify-end">
                <Button size="sm" type="submit" disabled={!note.trim()}>
                  <StickyNote /> Add note
                </Button>
              </div>
            </form>
            {notes && notes.length > 0 && (
              <ul className="mt-4 grid gap-3">
                {notes.map((n, i) => (
                  <li key={i} className="rounded-lg bg-secondary/60 px-3 py-2.5">
                    <p className="text-sm">{n.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.by} · {formatDateTime(n.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {messages && messages.length > 0 && (
            <Section title="Messages sent">
              <ul className="grid gap-3">
                {messages.map((m, i) => (
                  <li key={i} className="text-sm">
                    <p>{m.text}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(m.at)}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>

      <ExtendTrialDialog
        open={open === 'trial'}
        onClose={() => setOpen(null)}
        bizId={biz.id}
        name={biz.name}
        current={trialEnd}
        isSample={isSample}
      />
      <ChangePlanDialog
        open={open === 'plan'}
        onClose={() => setOpen(null)}
        bizId={biz.id}
        name={biz.name}
        current={biz.plan}
        isSample={isSample}
      />
      <ReasonDialog
        open={open === 'suspend'}
        onClose={() => setOpen(null)}
        title={`Suspend ${biz.name}?`}
        intro={`${biz.owner} and their team will not be able to change anything, and ${plural(biz.tenants, 'tenant')} will not see their bills. Nothing is deleted.`}
        confirmLabel="Suspend account"
        destructive
        onConfirm={(reason) => {
          updateDb((db) => {
            db.platformBusinesses = db.platformBusinesses.map((b) =>
              b.id === biz.id ? { ...b, status: 'suspended' } : b,
            )
          })
          updateExtras((x) => {
            x.suspendReasons[biz.id] = reason
            if (x.supportView === biz.id) x.supportView = null
            x.notes[biz.id] = [
              { at: stamp(), by: PERSON_SHORT, text: `Suspended: ${reason}` },
              ...(x.notes[biz.id] ?? []),
            ]
          })
          toast.success(`${biz.name} is suspended`)
        }}
      />
      <ReasonDialog
        open={open === 'reactivate'}
        onClose={() => setOpen(null)}
        title={`Switch ${biz.name} back on?`}
        intro="The owner, team and tenants get full access again straight away."
        confirmLabel="Switch back on"
        onConfirm={(reason) => {
          updateDb((db) => {
            db.platformBusinesses = db.platformBusinesses.map((b) =>
              b.id === biz.id ? { ...b, status: 'active' } : b,
            )
          })
          updateExtras((x) => {
            delete x.suspendReasons[biz.id]
            x.notes[biz.id] = [
              { at: stamp(), by: PERSON_SHORT, text: `Switched back on: ${reason}` },
              ...(x.notes[biz.id] ?? []),
            ]
          })
          toast.success(`${biz.name} is active again`)
        }}
      />
      <ReasonDialog
        open={open === 'signin'}
        onClose={() => setOpen(null)}
        title={`Sign in as ${biz.owner}?`}
        intro="You will see their app exactly as they do. Every page you open and every change is written to their activity log, and the owner can see it."
        reasonLabel="Why do you need to sign in?"
        placeholder="For example: ticket about WhatsApp reminders not going"
        confirmLabel="Start support view"
        onConfirm={(reason) => {
          updateExtras((x) => {
            x.supportView = biz.id
            x.notes[biz.id] = [
              {
                at: stamp(),
                by: PERSON_SHORT,
                text: `Signed in as owner (support view): ${reason}`,
              },
              ...(x.notes[biz.id] ?? []),
            ]
          })
          toast.success('Support view started', {
            description: 'Open their app from the yellow banner.',
          })
        }}
        icon={<Eye className="size-4" />}
      />
      <MessageDialog
        open={open === 'message'}
        onClose={() => setOpen(null)}
        bizId={biz.id}
        owner={biz.owner}
        phone={biz.phone}
      />
    </>
  )
}

function ExtendTrialDialog({
  open,
  onClose,
  bizId,
  name,
  current,
  isSample,
}: {
  open: boolean
  onClose: () => void
  bizId: string
  name: string
  current?: string
  isSample: boolean
}) {
  const [days, setDays] = useState<'7' | '14' | '30'>('7')
  const from = current && current > TODAY ? current : TODAY
  const until = addDays(from, Number(days))
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title="Extend free trial"
      description={`${name} keeps every Pro feature until the new date.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              updateDb((db) => {
                db.platformBusinesses = db.platformBusinesses.map((b) =>
                  b.id === bizId ? { ...b, planStatus: 'trial', plan: 'pro', mrr: 0 } : b,
                )
                if (isSample)
                  db.business = {
                    ...db.business,
                    plan: 'pro',
                    planStatus: 'trial',
                    planRenewsOn: until,
                  }
              })
              updateExtras((x) => {
                x.trialEnds[bizId] = until
                x.notes[bizId] = [
                  {
                    at: stamp(),
                    by: PERSON_SHORT,
                    text: `Trial extended by ${days} days, to ${formatDate(until)}.`,
                  },
                  ...(x.notes[bizId] ?? []),
                ]
              })
              toast.success(`Trial extended to ${formatDate(until)}`)
              onClose()
            }}
          >
            Extend trial
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <Field label="Add">
          <Segmented
            label="Days to add"
            value={days}
            onChange={setDays}
            options={[
              { value: '7', label: '7 days' },
              { value: '14', label: '14 days' },
              { value: '30', label: '30 days' },
            ]}
          />
        </Field>
        <DetailList
          cols={2}
          items={[
            ['Trial ends now', current ? formatDate(current) : 'Not on a trial'],
            ['New end date', formatDate(until)],
          ]}
        />
        <p className="text-[13px] text-muted-foreground">
          The owner gets an SMS and email with the new date.
        </p>
      </div>
    </Dialog>
  )
}

function ChangePlanDialog({
  open,
  onClose,
  bizId,
  name,
  current,
  isSample,
}: {
  open: boolean
  onClose: () => void
  bizId: string
  name: string
  current: PlanCode
  isSample: boolean
}) {
  const plans = useExtras((x) => x.plans)
  const [code, setCode] = useState<string>(current)
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const target = plans.find((p) => p.code === code)
  const error = tried && !reason.trim() ? 'Write why the plan is being changed.' : undefined
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title="Change plan"
      description={`Change ${name}’s plan without a payment. A downgrade never deletes data; it only stops adding more.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={code === current}
            onClick={() => {
              setTried(true)
              if (!reason.trim() || !target) return
              const known = ['free', 'starter', 'pro', 'business'].includes(code)
              updateDb((db) => {
                db.platformBusinesses = db.platformBusinesses.map((b) =>
                  b.id === bizId
                    ? {
                        ...b,
                        plan: (known ? code : b.plan) as PlanCode,
                        planStatus: code === 'free' ? 'ended' : 'active',
                        mrr: target.pricePerMonth,
                      }
                    : b,
                )
                if (isSample && known)
                  db.business = {
                    ...db.business,
                    plan: code as PlanCode,
                    planStatus: code === 'free' ? 'ended' : 'active',
                  }
              })
              updateExtras((x) => {
                delete x.trialEnds[bizId]
                x.notes[bizId] = [
                  {
                    at: stamp(),
                    by: PERSON_SHORT,
                    text: `Plan changed to ${target.name}: ${reason.trim()}`,
                  },
                  ...(x.notes[bizId] ?? []),
                ]
              })
              toast.success(`${name} is now on ${target.name}`)
              setReason('')
              setTried(false)
              onClose()
            }}
          >
            Change plan
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="New plan">
          <NativeSelect value={code} onChange={(e) => setCode(e.target.value)}>
            {plans
              .filter((p) => p.active || p.code === current)
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} – {formatMoney(p.pricePerMonth)} a month
                  {p.code === current ? ' (now)' : ''}
                </option>
              ))}
          </NativeSelect>
        </Field>
        {target && (
          <div className="rounded-lg border bg-secondary/40 p-3 text-[13px]">
            <p className="font-medium">{target.name} includes</p>
            <p className="mt-1 text-muted-foreground">
              {target.limits.properties ?? 'Unlimited'} properties ·{' '}
              {target.limits.beds ?? 'unlimited'} beds · {target.limits.team ?? 'unlimited'} team
              members
            </p>
            <p className="mt-1 text-muted-foreground">{target.features.join(' · ')}</p>
          </div>
        )}
        <Field label="Reason" required error={error}>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: paid by bank transfer, ref. HDFC 2231"
          />
        </Field>
      </div>
    </Dialog>
  )
}

function ReasonDialog({
  open,
  onClose,
  title,
  intro,
  confirmLabel,
  destructive,
  onConfirm,
  reasonLabel = 'Reason',
  placeholder = 'Write the reason. It is saved in the notes.',
  icon,
}: {
  open: boolean
  onClose: () => void
  title: string
  intro: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: (reason: string) => void
  reasonLabel?: string
  placeholder?: string
  icon?: ReactNode
}) {
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const error = tried && !reason.trim() ? 'Write a short reason so the team knows why.' : undefined
  function close() {
    setReason('')
    setTried(false)
    onClose()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => {
              setTried(true)
              if (!reason.trim()) return
              onConfirm(reason.trim())
              close()
            }}
          >
            {icon}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{intro}</p>
        <Field label={reasonLabel} required error={error}>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
          />
        </Field>
      </div>
    </Dialog>
  )
}

function MessageDialog({
  open,
  onClose,
  bizId,
  owner,
  phone,
}: {
  open: boolean
  onClose: () => void
  bizId: string
  owner: string
  phone: string
}) {
  const [channel, setChannel] = useState<'app' | 'sms' | 'email'>('app')
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const error = tried && !text.trim() ? 'Type the message you want to send.' : undefined
  const label = { app: 'in the app', sms: `by SMS to ${phone}`, email: 'by email' }[channel]
  function close() {
    setText('')
    setTried(false)
    onClose()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      variant="side"
      title={`Message ${owner}`}
      description="The owner sees it as a message from the PG Manager team."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true)
              if (!text.trim()) return
              updateExtras((x) => {
                x.messages[bizId] = [
                  { at: stamp(), text: `${text.trim()} (sent ${label})` },
                  ...(x.messages[bizId] ?? []),
                ]
              })
              toast.success(`Message sent ${label}`)
              close()
            }}
          >
            <MessageSquare /> Send
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Send">
          <Segmented
            label="Channel"
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'app', label: 'In the app' },
              { value: 'sms', label: 'SMS' },
              { value: 'email', label: 'Email' },
            ]}
          />
        </Field>
        <Field
          label="Message"
          required
          error={error}
          hint={channel === 'sms' ? `${text.length}/160 characters` : undefined}
        >
          <Textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Hello ${owner.split(' ')[0]}, …`}
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[
            'Your free trial ends soon – pick a plan to keep reminders and reports.',
            'Your last plan payment failed. Please pay from Settings → Plan.',
            'Your owner check is approved. Your listings now show “Owner verified”.',
          ].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setText(t)}
              className="rounded-full border bg-card px-3 py-1 text-left text-xs hover:bg-secondary"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
