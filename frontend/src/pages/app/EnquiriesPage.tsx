import {
  CalendarCheck,
  CalendarDays,
  Inbox,
  PhoneCall,
  Search,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import { useState } from 'react'

import { api } from '../../api/client'
import { useApiMutation, useList } from '../../api/hooks'
import type { Enquiry } from '../../api/types'
import { ErrorBanner } from '../../components/ui'
import { Card } from '../../components/ui-kit/card'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { EmptyState, PageHeader, Skeleton, StatCard } from '../../components/ui-kit/feedback'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { cn } from '../../lib/cn'
import { formatDate, initials } from '../../lib/format'
import { ENQUIRY_STATUSES } from '../../lib/options'

const FILTERS = [{ value: 'all', label: 'All leads' }, ...ENQUIRY_STATUSES]

const STATUS_DOT: Record<string, string> = {
  new: 'bg-amber-500',
  contacted: 'bg-sky-500',
  visit_scheduled: 'bg-sky-500',
  converted: 'bg-emerald-500',
  lost: 'bg-slate-400',
}

function EnquiryRow({ e }: { e: Enquiry }) {
  const [notes, setNotes] = useState(e.notes)
  const update = useApiMutation(
    (b: Record<string, unknown>) => api.patch(`/enquiries/${e.id}/`, b),
    ['/enquiries/', '/listings/', '/reports/'],
  )
  const isNew = e.status === 'new'
  return (
    <li
      className={cn(
        'relative flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-secondary/30 lg:flex-row lg:gap-6',
        isNew && 'bg-amber-50/30',
      )}
    >
      {isNew && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-amber-400" />}
      <div className="flex min-w-0 flex-1 gap-3.5">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
        >
          {initials(e.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h2 className={cn('text-[14px]', isNew ? 'font-semibold' : 'font-medium')}>{e.name}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDate(e.created_at)}
            </span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
            <a
              href={`tel:+91${e.phone}`}
              className="font-medium text-primary no-underline tabular-nums hover:underline"
            >
              {e.phone}
            </a>
            {e.email && (
              <>
                <span aria-hidden>·</span>
                <span className="break-all">{e.email}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{e.property_name}</span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground">
              {e.preferred_sharing ? `${e.preferred_sharing} sharing` : 'Any sharing'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground">
              <CalendarDays className="size-3" aria-hidden /> Move-in {formatDate(e.move_in_date)}
            </span>
          </div>
          {e.message && (
            <p className="mt-2.5 max-w-2xl rounded-lg border-l-2 border-border-strong bg-secondary/50 px-3 py-2 text-[13px] text-secondary-foreground">
              “{e.message}”
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-2 pl-[50px] lg:w-72 lg:shrink-0 lg:pl-0">
        <div className="relative">
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-1/2 left-2.5 size-2 -translate-y-1/2 rounded-full',
              STATUS_DOT[e.status ?? 'new'],
            )}
          />
          <NativeSelect
            aria-label="Lead status"
            value={e.status}
            onChange={(ev) => update.mutate({ status: ev.target.value })}
            className="h-8 pl-6 text-[13px] font-medium"
          >
            {ENQUIRY_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Textarea
          aria-label="Notes"
          rows={2}
          value={notes}
          placeholder="Notes"
          onChange={(ev) => setNotes(ev.target.value)}
          onBlur={() => notes !== e.notes && update.mutate({ notes })}
          className="min-h-16 text-[13px]"
        />
        {update.error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {update.error.message}
          </p>
        )}
      </div>
    </li>
  )
}

export function EnquiriesPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const { rows, isLoading, error } = useList<Enquiry>('/enquiries/', { status })
  const term = search.trim().toLowerCase()
  const shown = term
    ? rows.filter((e) =>
        [e.name, e.phone, e.email, e.property_name, e.message, e.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : rows
  const count = (s: string) => rows.filter((e) => e.status === s).length
  return (
    <>
      <PageHeader title="Enquiries" description="Leads from your public listings." />
      <div className="grid gap-5">
        {status === '' && !isLoading && rows.length > 0 && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="New" value={count('new')} icon={<Sparkles />} />
            <StatCard label="Contacted" value={count('contacted')} icon={<PhoneCall />} />
            <StatCard
              label="Visit scheduled"
              value={count('visit_scheduled')}
              icon={<CalendarCheck />}
            />
            <StatCard label="Converted" value={count('converted')} icon={<UserCheck />} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search enquiries"
              placeholder="Search name, mobile or notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&_button]:whitespace-nowrap">
            <Segmented
              label="Status"
              value={status || 'all'}
              onChange={(v) => setStatus(v === 'all' ? '' : v)}
              options={FILTERS}
            />
          </div>
        </div>
        <ErrorBanner error={error} />
        {isLoading ? (
          <Card className="divide-y" role="status" aria-label="Loading">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3.5 px-5 py-4">
                <Skeleton className="size-9 rounded-full" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="hidden h-16 w-72 lg:block" />
              </div>
            ))}
          </Card>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={term ? 'No enquiries match your search.' : 'No enquiries yet.'}
          >
            {term
              ? 'Try another word, or clear the search.'
              : 'When someone asks about one of your published listings, they show up here.'}
          </EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <div className="border-b bg-secondary/40 px-5 py-2.5 text-xs font-medium text-muted-foreground">
              {shown.length} {shown.length === 1 ? 'lead' : 'leads'}
            </div>
            <ul className="divide-y">
              {shown.map((e) => (
                <EnquiryRow key={e.id} e={e} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}
