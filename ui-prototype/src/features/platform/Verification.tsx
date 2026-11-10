import { BadgeCheck, Building2, Clock, FileText, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { FilterChips, SearchBox, Status, Toolbar } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { TODAY } from '../../data/seed'
import { useDb } from '../../data/store'
import type { VerificationItem } from '../../data/types'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { CHECK_STATUS, daysBetween, waitingLabel } from './util'

type StatusFilter = 'open' | VerificationItem['status'] | 'all'
type KindFilter = 'all' | VerificationItem['kind']

export function Verification() {
  useBreadcrumbs([{ label: 'Checks' }])
  const navigate = useNavigate()
  const queue = useDb((db) => db.verificationQueue)
  const [status, setStatus] = useState<StatusFilter>('open')
  const [kind, setKind] = useState<KindFilter>('all')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return queue
      .filter((v) =>
        status === 'all'
          ? true
          : status === 'open'
            ? v.status === 'submitted' || v.status === 'under_review'
            : v.status === status,
      )
      .filter((v) => kind === 'all' || v.kind === kind)
      .filter(
        (v) =>
          !term || [v.business, v.subject, v.locality].some((s) => s.toLowerCase().includes(term)),
      )
      .sort((a, b) => a.submittedOn.localeCompare(b.submittedOn))
  }, [queue, status, kind, q])

  const count = (fn: (v: VerificationItem) => boolean) => queue.filter(fn).length

  return (
    <>
      <PageHeader
        title="Owner and property checks"
        description="Look at what owners sent and decide. Oldest first. A check never blocks the owner’s app; it only adds the “verified” mark to public listings."
      />
      <Toolbar>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search business, owner or property"
          className="w-full sm:max-w-sm"
        />
      </Toolbar>
      <div className="mb-5 grid gap-2">
        <FilterChips<StatusFilter>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            {
              value: 'open',
              label: 'To do',
              count: count((v) => v.status === 'submitted' || v.status === 'under_review'),
            },
            { value: 'submitted', label: 'Waiting', count: count((v) => v.status === 'submitted') },
            {
              value: 'under_review',
              label: 'Being checked',
              count: count((v) => v.status === 'under_review'),
            },
            {
              value: 'more_info',
              label: 'More information asked',
              count: count((v) => v.status === 'more_info'),
            },
            { value: 'approved', label: 'Approved', count: count((v) => v.status === 'approved') },
            {
              value: 'rejected',
              label: 'Not approved',
              count: count((v) => v.status === 'rejected'),
            },
            { value: 'all', label: 'All', count: queue.length },
          ]}
        />
        <FilterChips<KindFilter>
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Owners and properties' },
            { value: 'owner', label: 'Owner ID', count: count((v) => v.kind === 'owner') },
            { value: 'property', label: 'Property', count: count((v) => v.kind === 'property') },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="Nothing here">
          {status === 'open'
            ? 'All checks are done. Nice work!'
            : 'No check matches these filters.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((v) => {
            const days = daysBetween(v.submittedOn, TODAY)
            const late = days >= 3 && (v.status === 'submitted' || v.status === 'under_review')
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => navigate(`/platform/verification/${v.id}`)}
                className="flex flex-col rounded-xl border bg-card p-4 text-left shadow-xs transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg',
                      v.kind === 'owner'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-emerald-50 text-emerald-700',
                    )}
                  >
                    {v.kind === 'owner' ? (
                      <BadgeCheck className="size-5" />
                    ) : (
                      <Building2 className="size-5" />
                    )}
                  </span>
                  <Status of={CHECK_STATUS} value={v.status} />
                </div>
                <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {v.kind === 'owner' ? 'Owner ID' : 'Property'}
                </p>
                <p className="mt-0.5 font-semibold">{v.subject}</p>
                <p className="text-[13px] text-muted-foreground">
                  {v.business} · {v.locality}
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {v.documents.map((d) => (
                    <li key={d}>
                      <Badge tone="outline">
                        <FileText /> {d}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      late && 'font-medium text-red-600',
                    )}
                  >
                    <Clock className="size-3.5" /> {waitingLabel(v)}
                  </span>
                  <span>
                    {v.assignedTo
                      ? `With ${v.assignedTo.replace(' (Reviewer)', '')}`
                      : `Sent ${formatDate(v.submittedOn)}`}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
