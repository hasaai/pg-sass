import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarClock,
  Download,
  FileUp,
  IndianRupee,
  LogIn,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { api, downloadFile } from '../../api/client'
import { useApi, useList } from '../../api/hooks'
import type { Invoice, Stay, Tenant } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import {
  Alert,
  EmptyState,
  ErrorAlert,
  Meter,
  PageHeader,
  Skeleton,
} from '../../components/ui-kit/feedback'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui-kit/menu'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui-kit/tabs'
import { toast } from '../../components/ui-kit/toast'
import { addMonths, formatDate, formatMoney, formatMonth, plural } from '../../lib/format'
import { displayPhone, openStay, useStayAction, whatsappLink } from './api'
import {
  CheckInDialog,
  CheckoutDialog,
  DepositDialog,
  MoveDialog,
  NoticeDialog,
  TenantDialog,
  TermsDialog,
} from './dialogs'
import { STAY_TONE, ageFrom } from './labels'
import { Avatar, StatusBadge } from './TenantsListPage'

type Open = null | 'edit' | 'checkin' | 'notice' | 'move' | 'deposit' | 'checkout' | 'terms'

const INVOICE_WORDS = {
  issued: { label: 'Not paid', tone: 'warn' },
  partially_paid: { label: 'Part paid', tone: 'warn' },
  paid: { label: 'Paid', tone: 'good' },
  void: { label: 'Cancelled', tone: 'neutral' },
} as const

const DEPOSIT_WORDS = {
  collected: 'Paid by tenant',
  deducted: 'Kept',
  refunded: 'Given back',
} as const

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words">{v || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function AgreementFile({ stay, tenantName }: { stay: Stay; tenantName: string }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function upload(file: File | undefined) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return setError(new Error('The file is over 5 MB.'))
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.upload(`/stays/${stay.id}/agreement/`, form)
      await queryClient.invalidateQueries({ queryKey: ['/stays/'] })
      toast.success('Agreement saved')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-2">
      <ErrorAlert error={error} />
      <div className="flex flex-wrap items-center gap-2">
        {stay.has_agreement_file && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void downloadFile(
                `/stays/${stay.id}/agreement/`,
                `agreement-${tenantName.replace(/\W+/g, '-').toLowerCase()}`,
              ).catch(setError)
            }
          >
            <Download /> Open signed copy
          </Button>
        )}
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium shadow-xs hover:bg-accent [&_svg]:size-4">
          <FileUp />
          {busy ? 'Uploading…' : stay.has_agreement_file ? 'Replace' : 'Upload signed copy'}
          <input
            type="file"
            className="sr-only"
            aria-label="Signed agreement file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        PDF or photo, up to 5 MB. Only owners and managers can open it.
      </p>
    </div>
  )
}

function CurrentStay({
  stay,
  tenant,
  canManage,
  onOpen,
}: {
  stay: Stay
  tenant: Tenant
  canManage: boolean
  onOpen: (o: Open) => void
}) {
  const { can } = useAuth()
  const lockInEnds = stay.lock_in_months ? addMonths(stay.check_in, stay.lock_in_months) : null
  return (
    <Card>
      <CardHeader
        title="Current stay"
        description={`${stay.place.property_name} · ${stay.place.label}`}
        actions={
          <Badge tone={STAY_TONE[stay.status]} dot>
            {stay.status === 'notice' ? 'Leaving soon' : 'Staying'}
          </Badge>
        }
      />
      <CardContent className="grid gap-5">
        <Facts
          rows={[
            [
              'Property',
              <Link key="p" to={`/app/properties/${stay.place.property_id}`}>
                {stay.place.property_name}
              </Link>,
            ],
            ['Place', stay.place.label],
            ['Moved in', formatDate(stay.check_in)],
            ['Rent', `${formatMoney(stay.monthly_rent)} per month`],
            ...(stay.status === 'notice'
              ? ([
                  ['Told you on', formatDate(stay.notice_date)],
                  ['Leaving on', formatDate(stay.expected_checkout)],
                ] as [string, ReactNode][])
              : []),
          ]}
        />
        <div className="rounded-lg border p-3">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium">Deposit</span>
            <span className="tabular-nums">
              {formatMoney(stay.deposit_held)} of {formatMoney(stay.deposit_amount)} paid
            </span>
          </div>
          <Meter
            value={stay.deposit_held}
            max={Math.max(stay.deposit_amount, stay.deposit_held, 1)}
            label="Deposit paid"
          />
          {can('rent.adjust') && stay.deposit_held < stay.deposit_amount && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => onOpen('deposit')}>
              <IndianRupee /> Collect deposit
            </Button>
          )}
        </div>
        <div className="grid gap-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Stay terms</h3>
            {canManage && (
              <Button size="sm" variant="ghost" onClick={() => onOpen('terms')}>
                <Pencil /> Edit
              </Button>
            )}
          </div>
          <Facts
            rows={[
              ['Notice period', plural(stay.notice_period_days, 'day')],
              [
                'Lock-in',
                stay.lock_in_months
                  ? `${plural(stay.lock_in_months, 'month')} (until ${formatDate(lockInEnds)})`
                  : 'None',
              ],
              ['Agreement ends', stay.agreement_end ? formatDate(stay.agreement_end) : 'Not set'],
              ['Signed agreement', stay.has_agreement_file ? 'Uploaded' : 'Not uploaded'],
            ]}
          />
          {can('tenants.id_documents') && (
            <AgreementFile stay={stay} tenantName={tenant.full_name} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Profile({ t }: { t: Tenant }) {
  const age = ageFrom(t.date_of_birth)
  return (
    <Card className="self-start">
      <CardHeader title="Profile" />
      <CardContent>
        <dl className="grid gap-3 text-sm">
          {(
            [
              ['Mobile', displayPhone(t.phone)],
              ['Email', t.email],
              ['Gender', t.gender_label],
              ['Age', age !== null ? `${age} (born ${formatDate(t.date_of_birth)})` : ''],
              ['Job or college', t.occupation],
              ['Home address', t.home_address],
              ['ID proof', t.id_type ? `${t.id_type_label} ending ${t.id_last4 || '····'}` : ''],
              [
                'Emergency contact',
                t.emergency_contact_name
                  ? `${t.emergency_contact_name}${t.emergency_contact_phone ? ` · ${displayPhone(t.emergency_contact_phone)}` : ''}`
                  : '',
              ],
              [
                'Agreed to data use',
                t.consent_given_at ? formatDate(t.consent_given_at.slice(0, 10)) : 'No',
              ],
              ['Notes', t.notes],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 break-words whitespace-pre-line">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function RentTab({ tenantId }: { tenantId: string }) {
  const invoices = useList<Invoice>('/invoices/', { tenant: tenantId })
  const due = invoices.rows.filter((i) => i.status !== 'void').reduce((n, i) => n + i.balance, 0)
  if (invoices.isLoading) return <Skeleton className="h-40" />
  return (
    <Card>
      <CardHeader
        title="Rent"
        description={
          invoices.rows.length
            ? due
              ? `${formatMoney(due)} still to pay`
              : 'Nothing to pay'
            : undefined
        }
      />
      {invoices.rows.length === 0 ? (
        <CardContent>
          <p className="text-[13px] text-muted-foreground">
            No rent bills yet. Make this month’s rent from Rent &amp; payments.
          </p>
        </CardContent>
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Month</TH>
              <TH className="hidden sm:table-cell">Bill</TH>
              <TH>Amount</TH>
              <TH>To pay</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {invoices.rows.map((inv) => {
              const w = inv.is_overdue
                ? ({ label: 'Late', tone: 'bad' } as const)
                : INVOICE_WORDS[inv.status]
              return (
                <TR key={inv.id}>
                  <TD className="text-[13px]">{formatMonth(inv.period)}</TD>
                  <TD className="hidden text-[13px] sm:table-cell">
                    <Link to={`/app/billing/invoices/${inv.id}`}>{inv.number}</Link>
                  </TD>
                  <TD className="text-[13px] tabular-nums">{formatMoney(inv.total)}</TD>
                  <TD className="text-[13px] tabular-nums">{formatMoney(inv.balance)}</TD>
                  <TD>
                    <Badge tone={w.tone} dot>
                      {w.label}
                    </Badge>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}
    </Card>
  )
}

function StaysTab({ stays }: { stays: Stay[] }) {
  if (stays.length === 0)
    return <EmptyState title="No stays yet">They have not been checked in anywhere.</EmptyState>
  return (
    <div className="grid gap-4">
      {stays.map((s) => (
        <Card key={s.id}>
          <CardHeader
            title={`${s.place.property_name} · ${s.place.label}`}
            description={`${formatDate(s.check_in)} to ${
              s.check_out
                ? formatDate(s.check_out)
                : s.expected_checkout
                  ? `${formatDate(s.expected_checkout)} (planned)`
                  : 'now'
            } · ${formatMoney(s.monthly_rent)} per month`}
            actions={
              <Badge tone={STAY_TONE[s.status]} dot>
                {s.status_label}
              </Badge>
            }
          />
          {s.deposit_transactions.length > 0 && (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Deposit</TH>
                  <TH>Date</TH>
                  <TH className="hidden sm:table-cell">Note</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {s.deposit_transactions.map((d) => (
                  <TR key={d.id}>
                    <TD className="text-[13px]">{DEPOSIT_WORDS[d.kind]}</TD>
                    <TD className="text-[13px]">{formatDate(d.date)}</TD>
                    <TD className="hidden text-[13px] text-muted-foreground sm:table-cell">
                      {d.note}
                    </TD>
                    <TD className="text-right text-[13px] tabular-nums">
                      {d.kind === 'collected' ? '' : '−'}
                      {formatMoney(d.amount)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ))}
    </div>
  )
}

export function TenantDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { can } = useAuth()
  const canManage = can('tenants.manage')
  const [dialog, setDialog] = useState<Open>(params.get('edit') ? 'edit' : null)
  const tenant = useApi<Tenant>(`/tenants/${id}/`)
  const stays = useList<Stay>('/stays/', { tenant: id })
  const open = openStay(stays.rows)
  const withdraw = useStayAction(open ?? { id: '' }, 'withdraw-notice', () =>
    toast.success('Notice withdrawn; they are staying'),
  )
  useBreadcrumbs([
    { label: 'Tenants', to: '/app/tenants' },
    { label: tenant.data?.full_name ?? '…' },
  ])
  const close = () => {
    setDialog(null)
    if (params.get('edit')) setParams({}, { replace: true })
  }

  if (tenant.isLoading) return <Skeleton className="h-96" />
  if (!tenant.data)
    return (
      <EmptyState
        title="Tenant not found"
        actions={
          <Button variant="outline" asChild>
            <Link to="/app/tenants">Back to tenants</Link>
          </Button>
        }
      >
        <ErrorAlert error={tenant.error} />
      </EmptyState>
    )
  const t = tenant.data

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            to="/app/tenants"
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground no-underline hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Tenants
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Avatar name={t.full_name} className="size-10 text-sm" />
            {t.full_name}
            <StatusBadge t={t} />
          </span>
        }
        description={[displayPhone(t.phone), t.email, t.occupation].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`tel:${t.phone}`}>
                <Phone /> Call
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={whatsappLink(t.phone)} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
            {canManage && !open && (
              <Button onClick={() => setDialog('checkin')}>
                <LogIn /> Check in
              </Button>
            )}
            {canManage && (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="outline" aria-label="More actions">
                    <MoreHorizontal /> More
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Pencil />} onSelect={() => setDialog('edit')}>
                    Edit details
                  </MenuItem>
                  {open && (
                    <>
                      <MenuSeparator />
                      {open.status === 'active' ? (
                        <MenuItem icon={<CalendarClock />} onSelect={() => setDialog('notice')}>
                          Tenant is leaving
                        </MenuItem>
                      ) : (
                        <MenuItem icon={<Undo2 />} onSelect={() => withdraw.mutate(undefined)}>
                          Cancel notice (staying)
                        </MenuItem>
                      )}
                      <MenuItem icon={<ArrowRightLeft />} onSelect={() => setDialog('move')}>
                        Move to another place
                      </MenuItem>
                      {can('rent.adjust') && (
                        <MenuItem icon={<IndianRupee />} onSelect={() => setDialog('deposit')}>
                          Collect deposit
                        </MenuItem>
                      )}
                      <MenuSeparator />
                      <MenuItem
                        icon={<LogOut />}
                        destructive
                        onSelect={() => setDialog('checkout')}
                      >
                        Check out
                      </MenuItem>
                    </>
                  )}
                </MenuContent>
              </Menu>
            )}
          </>
        }
      />

      {open?.status === 'notice' && (
        <Alert
          tone="warn"
          title={`Leaving on ${formatDate(open.expected_checkout)}`}
          className="mb-5"
        >
          Notice given on {formatDate(open.notice_date)}. Check them out on the day they leave to
          settle the deposit.
        </Alert>
      )}
      <ErrorAlert error={withdraw.error} className="mb-5" />

      <Tabs defaultValue="overview">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {can('rent.view') && <TabsTrigger value="rent">Rent</TabsTrigger>}
          <TabsTrigger value="stays">Stays ({stays.rows.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="grid min-w-0 content-start gap-5 xl:col-span-2">
              {stays.isLoading ? (
                <Skeleton className="h-64" />
              ) : open ? (
                <CurrentStay stay={open} tenant={t} canManage={canManage} onOpen={setDialog} />
              ) : (
                <EmptyState
                  icon={<LogIn />}
                  title={
                    t.moved_out_on
                      ? `Moved out on ${formatDate(t.moved_out_on)}`
                      : 'Not checked in yet'
                  }
                  actions={
                    canManage && (
                      <Button onClick={() => setDialog('checkin')}>
                        <LogIn /> Check in
                      </Button>
                    )
                  }
                >
                  Give them a bed, a whole room or a whole flat.
                </EmptyState>
              )}
            </div>
            <Profile t={t} />
          </div>
        </TabsContent>
        {can('rent.view') && (
          <TabsContent value="rent">
            <RentTab tenantId={t.id} />
          </TabsContent>
        )}
        <TabsContent value="stays">
          <StaysTab stays={stays.rows} />
        </TabsContent>
      </Tabs>

      <TenantDialog open={dialog === 'edit'} onOpenChange={(o) => !o && close()} tenant={t} />
      {dialog === 'checkin' && <CheckInDialog open onOpenChange={close} tenant={t} />}
      {open && (
        <>
          {dialog === 'notice' && <NoticeDialog open onOpenChange={close} stay={open} />}
          {dialog === 'move' && (
            <MoveDialog open onOpenChange={close} stay={open} tenantName={t.full_name} />
          )}
          {dialog === 'deposit' && <DepositDialog open onOpenChange={close} stay={open} />}
          {dialog === 'checkout' && (
            <CheckoutDialog open onOpenChange={close} stay={open} tenantName={t.full_name} />
          )}
          {dialog === 'terms' && <TermsDialog open onOpenChange={close} stay={open} />}
        </>
      )}
    </>
  )
}
