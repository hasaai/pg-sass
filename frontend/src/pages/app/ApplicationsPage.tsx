import { BedDouble, Check, ClipboardList, Search, X } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'

import { api } from '../../api/client'
import { useApiMutation, useList } from '../../api/hooks'
import type { Application, Bed, Listing } from '../../api/types'
import { ErrorBanner, SelectField, TextAreaField, TextField } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Input } from '../../components/ui-kit/input'
import { cn } from '../../lib/cn'
import {
  formatDate,
  formatMoney,
  initials,
  paiseToRupeesInput,
  rupeesToPaise,
  titleCase,
} from '../../lib/format'
import { ID_TYPE_OPTIONS } from '../../lib/options'
import { useForm } from '../../lib/useForm'

const INVALIDATE = [
  '/applications/',
  '/beds/',
  '/rooms/',
  '/properties/',
  '/stays/',
  '/tenants/',
  '/reports/',
  '/listings/',
]
const FILTERS = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
]
const TONE = { pending: 'warn', approved: 'good', declined: 'bad', withdrawn: 'neutral' } as const

const FOOTER =
  'sticky -bottom-5 -mx-6 -mb-5 mt-1 flex flex-wrap justify-end gap-2 border-t bg-card px-6 py-3.5'

function rupees(input: string, label: string, required = true): number | undefined {
  if (!input.trim()) {
    if (required) return 0
    return undefined
  }
  const paise = rupeesToPaise(input)
  if (paise === null) throw new Error(`${label}: enter an amount in rupees, e.g. 8500.`)
  return paise
}

function ApproveForm({
  application,
  propertyId,
  onDone,
  onCancel,
}: {
  application: Application
  propertyId: string | undefined
  onDone: () => void
  onCancel: () => void
}) {
  const beds = useList<Bed>(propertyId ? '/beds/' : null, {
    property: propertyId,
    status: 'vacant',
  })
  const reserved = useList<Bed>(propertyId ? '/beds/' : null, {
    property: propertyId,
    status: 'reserved',
  })
  const all = [...beds.rows, ...reserved.rows]
  const preferred = all.filter(
    (b) => !application.preferred_sharing || b.sharing === application.preferred_sharing,
  )
  const choices = preferred.length ? preferred : all
  const form = useForm({
    bed: '',
    check_in: application.move_in_date,
    monthly_rent: '',
    deposit_amount: '',
    deposit_collected: '',
  })
  const approve = useApiMutation(
    (body: Record<string, unknown>) => api.post(`/applications/${application.id}/approve/`, body),
    INVALIDATE,
    onDone,
  )
  const bed = all.find((b) => b.id === form.values.bed)
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const body: Record<string, unknown> = {
        bed: form.values.bed,
        check_in: form.values.check_in,
        deposit_amount: rupees(form.values.deposit_amount, 'Deposit'),
        deposit_collected: rupees(form.values.deposit_collected, 'Deposit collected'),
      }
      const rent = rupees(form.values.monthly_rent, 'Rent', false)
      if (rent !== undefined) body.monthly_rent = rent
      approve.mutate(body, { onError: form.setError })
    } catch (err) {
      form.setError(err)
    }
  }
  if (beds.isLoading || reserved.isLoading)
    return (
      <div className="grid gap-4" role="status" aria-label="Loading">
        <Skeleton className="h-10" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    )
  if (all.length === 0) {
    return (
      <Alert tone="bad">
        No free beds in {application.listing.name}. Free a bed first, or decline with a reason.
      </Alert>
    )
  }
  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <p className="rounded-lg bg-secondary/60 px-3 py-2.5 text-[13px] text-muted-foreground">
        {application.full_name} becomes a tenant and is checked in to the bed you choose. They get
        an email.
      </p>
      <ErrorBanner
        error={form.error}
        fields={['bed', 'check_in', 'monthly_rent', 'deposit_amount', 'deposit_collected']}
      />
      <SelectField
        label={`Bed in ${application.listing.name}`}
        placeholder="Choose a free bed"
        options={choices.map((b) => ({
          value: b.id,
          label: `Room ${b.room_number} · Bed ${b.label} · ${b.sharing}-sharing · ${formatMoney(b.monthly_rent)}${b.status === 'reserved' ? ' (reserved)' : ''}`,
        }))}
        error={form.fieldError('bed')}
        {...form.bind('bed')}
        onChange={(e) => {
          const picked = all.find((b) => b.id === e.target.value)
          form.setValues((v) => ({
            ...v,
            bed: e.target.value,
            deposit_amount:
              v.deposit_amount || (picked ? paiseToRupeesInput(picked.monthly_rent * 2) : ''),
          }))
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Check-in date"
          type="date"
          error={form.fieldError('check_in')}
          {...form.bind('check_in')}
        />
        <TextField
          label="Monthly rent (₹)"
          inputMode="decimal"
          placeholder={bed ? paiseToRupeesInput(bed.monthly_rent) : 'Bed rent'}
          hint="Leave empty to use the bed's rent."
          error={form.fieldError('monthly_rent')}
          {...form.bind('monthly_rent')}
        />
        <TextField
          label="Security deposit (₹)"
          inputMode="decimal"
          error={form.fieldError('deposit_amount')}
          {...form.bind('deposit_amount')}
        />
        <TextField
          label="Deposit collected now (₹)"
          inputMode="decimal"
          error={form.fieldError('deposit_collected')}
          {...form.bind('deposit_collected')}
        />
      </div>
      <div className={FOOTER}>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" busy={approve.isPending}>
          Approve and check in
        </Button>
      </div>
    </form>
  )
}

function DeclineForm({
  application,
  onDone,
  onCancel,
}: {
  application: Application
  onDone: () => void
  onCancel: () => void
}) {
  const form = useForm({ reason: '' })
  const decline = useApiMutation(
    (body: Record<string, unknown>) => api.post(`/applications/${application.id}/decline/`, body),
    INVALIDATE,
    onDone,
  )
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        decline.mutate(form.values, { onError: form.setError })
      }}
    >
      <ErrorBanner error={form.error} fields={['reason']} />
      <TextAreaField
        label={`Reason (sent to ${application.full_name})`}
        rows={3}
        placeholder="e.g. No single rooms free until January."
        error={form.fieldError('reason')}
        {...form.bind('reason')}
      />
      <div className={FOOTER}>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" busy={decline.isPending}>
          Decline application
        </Button>
      </div>
    </form>
  )
}

function Fact({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium">{children}</dd>
    </div>
  )
}

function ApplicationRow({
  a,
  onApprove,
  onDecline,
}: {
  a: Application
  onApprove: () => void
  onDecline: () => void
}) {
  const idLabel = ID_TYPE_OPTIONS.find((o) => o.value === a.id_type)?.label ?? titleCase(a.id_type)
  return (
    <li className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-secondary/30 lg:flex-row lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-1 gap-3.5">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
        >
          {initials(a.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-semibold">{a.full_name}</h2>
            <Badge tone={TONE[a.status]} dot>
              {FILTERS.find((f) => f.value === a.status)?.label ?? titleCase(a.status)}
            </Badge>
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {a.listing.name} · applied {formatDate(a.created_at)}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Fact label="Mobile">
              <a
                href={`tel:+91${a.phone}`}
                className="text-primary no-underline tabular-nums hover:underline"
              >
                {a.phone}
              </a>
            </Fact>
            <Fact label="Move-in">{formatDate(a.move_in_date)}</Fact>
            <Fact label="Wants">
              {a.preferred_sharing ? `${a.preferred_sharing} sharing` : 'Any sharing'}
            </Fact>
            {a.occupation && <Fact label="Occupation">{a.occupation}</Fact>}
            {a.id_type && (
              <Fact label="ID">
                {idLabel} ····{a.id_last4}
              </Fact>
            )}
            {a.email && (
              <Fact label="Email" className="col-span-2 sm:col-span-1">
                {a.email}
              </Fact>
            )}
          </dl>
          {a.message && (
            <p className="mt-3 max-w-2xl rounded-lg border-l-2 border-border-strong bg-secondary/50 px-3 py-2 text-[13px] text-secondary-foreground">
              “{a.message}”
            </p>
          )}
          {a.allocated && (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-emerald-800">
              <BedDouble className="size-4" aria-hidden />
              Allotted Room {a.allocated.room_number} · Bed {a.allocated.bed_label} from{' '}
              {formatDate(a.allocated.check_in)}
            </p>
          )}
          {a.decline_reason && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">Declined: </span>
              {a.decline_reason}
            </p>
          )}
        </div>
      </div>
      {a.status === 'pending' && (
        <div className="flex gap-2 pl-[50px] lg:shrink-0 lg:pl-0">
          <Button variant="outline" size="sm" onClick={onDecline}>
            <X /> Decline
          </Button>
          <Button size="sm" onClick={onApprove}>
            <Check /> Approve
          </Button>
        </div>
      )}
    </li>
  )
}

type DialogState = { kind: 'approve' | 'decline'; application: Application } | null

export function ApplicationsPage() {
  const [status, setStatus] = useState('pending')
  const [search, setSearch] = useState('')
  const applications = useList<Application>('/applications/', { status })
  const listings = useList<Listing>('/listings/')
  const [dialog, setDialog] = useState<DialogState>(null)
  const propertyOf = (slug: string) => listings.rows.find((l) => l.slug === slug)?.property
  const close = () => setDialog(null)
  const term = search.trim().toLowerCase()
  const rows = term
    ? applications.rows.filter((a) =>
        [a.full_name, a.phone, a.email, a.listing.name]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(term)),
      )
    : applications.rows
  return (
    <>
      <PageHeader
        title="Applications"
        description="People who applied online from your marketplace listings."
      />
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search applications"
              placeholder="Search name, mobile or PG"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&_button]:whitespace-nowrap">
            <Segmented label="Status" value={status} onChange={setStatus} options={FILTERS} />
          </div>
        </div>
        <ErrorBanner error={applications.error} />
        {applications.isLoading ? (
          <Card className="divide-y" role="status" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3.5 px-5 py-4">
                <Skeleton className="size-9 rounded-full" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                  <Skeleton className="mt-2 h-8 w-full max-w-xl" />
                </div>
              </div>
            ))}
          </Card>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title={
              term
                ? 'No applications match your search.'
                : status === 'pending'
                  ? 'No applications waiting.'
                  : 'Nothing here.'
            }
          >
            <p>
              Applications arrive from your{' '}
              <Link
                to="/app/listings"
                className="font-medium text-primary no-underline hover:underline"
              >
                published listings
              </Link>
              .
            </p>
          </EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <div className="border-b bg-secondary/40 px-5 py-2.5 text-xs font-medium text-muted-foreground">
              {rows.length} {rows.length === 1 ? 'application' : 'applications'}
            </div>
            <ul className="divide-y">
              {rows.map((a) => (
                <ApplicationRow
                  key={a.id}
                  a={a}
                  onApprove={() => setDialog({ kind: 'approve', application: a })}
                  onDecline={() => setDialog({ kind: 'decline', application: a })}
                />
              ))}
            </ul>
          </Card>
        )}
      </div>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && close()}
        title={dialog?.kind === 'approve' ? 'Approve into a bed' : 'Decline application'}
        description={
          dialog
            ? `${dialog.application.full_name} · ${dialog.application.listing.name}`
            : undefined
        }
      >
        {dialog?.kind === 'approve' && (
          <ApproveForm
            application={dialog.application}
            propertyId={propertyOf(dialog.application.listing.slug)}
            onDone={close}
            onCancel={close}
          />
        )}
        {dialog?.kind === 'decline' && (
          <DeclineForm application={dialog.application} onDone={close} onCancel={close} />
        )}
      </Dialog>
    </>
  )
}
