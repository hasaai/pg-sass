import { Building2, Clock, FileText, ListChecks, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useApi } from '../../api/hooks'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { EmptyState, ErrorAlert, PageHeader } from '../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { cn } from '../../lib/cn'
import { plural, relativeTime } from '../../lib/format'
import { VERIFICATION_TONE } from '../properties/labels'
import {
  FilterBar,
  FilterChips,
  LogoTile,
  NameCell,
  Pager,
  SearchBox,
  TableSkeleton,
} from './parts'
import type { PlatformProperty, PropertyPage } from './types'

const PAGE_SIZE = 25
const FILTERS = [
  { value: '', label: 'All' },
  { value: 'submitted', label: 'Being checked' },
  { value: 'verified', label: 'Verified' },
  { value: 'changes_requested', label: 'Changes needed' },
  { value: 'rejected', label: 'Not approved' },
  { value: 'unverified', label: 'Not checked yet' },
] as const

const DAY = 86_400_000

export function VerificationBadge({
  p,
}: {
  p: Pick<PlatformProperty, 'verification_status' | 'verification_status_label'>
}) {
  return (
    <Badge tone={VERIFICATION_TONE[p.verification_status]} dot>
      {p.verification_status_label}
    </Badge>
  )
}

/** All properties of all businesses; with `queue`, only those waiting, oldest first. */
export function PlatformPropertiesPage({ queue = false }: { queue?: boolean }) {
  useBreadcrumbs([{ label: queue ? 'Verification queue' : 'All properties' }])
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = queue ? 'submitted' : (params.get('verification') ?? '')
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const [search, setSearch] = useState(q)
  const [now] = useState(() => Date.now())
  const list = useApi<PropertyPage>('/platform/properties/', {
    q: q || undefined,
    verification_status: status || undefined,
    page,
    page_size: PAGE_SIZE,
  })
  const rows = list.data?.results ?? []
  const count = list.data?.count ?? 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v)
      else merged.delete(k)
    }
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  return (
    <>
      <PageHeader
        title={queue ? 'Verification queue' : 'All properties'}
        description={
          queue
            ? 'Properties whose owners asked to be verified. Check their proof documents, then decide.'
            : 'Every property of every business.'
        }
        actions={
          queue && list.data ? (
            <Badge tone={count ? 'info' : 'good'} dot className="h-7 px-2.5 text-[13px]">
              {count ? `${plural(count, 'property', 'properties')} waiting` : 'All checked'}
            </Badge>
          ) : null
        }
      />
      <Card className="overflow-hidden">
        <FilterBar>
          <SearchBox
            label="Search by property, locality or business"
            value={search}
            onChange={setSearch}
            onSubmit={() => update({ q: search.trim() || null })}
          />
          {!queue && (
            <FilterChips
              label="Verification"
              value={status as (typeof FILTERS)[number]['value']}
              options={FILTERS}
              onChange={(v) => update({ verification: v || null })}
            />
          )}
        </FilterBar>
        <ErrorAlert error={list.error} className="m-4" />
        {list.isLoading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            className="m-4 border-0"
            icon={queue ? <ShieldCheck /> : <ListChecks />}
            title={queue ? 'Nothing waiting to be checked' : 'No properties match'}
          >
            {queue
              ? 'When an owner sends a property for verification, it shows up here.'
              : 'Try another search or filter.'}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Property</TH>
                <TH className="hidden md:table-cell">Business</TH>
                <TH className="hidden sm:table-cell">Verification</TH>
                <TH className="hidden lg:table-cell">Documents</TH>
                <TH className="hidden lg:table-cell">{queue ? 'Sent' : 'Updated'}</TH>
                <TH className="w-24">
                  <span className="sr-only">Open</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => {
                const when = queue && p.submitted_at ? p.submitted_at : p.updated_at
                const waitingLong =
                  queue && p.submitted_at && now - new Date(p.submitted_at).getTime() > 3 * DAY
                return (
                  <TR key={p.id}>
                    <TD className="max-w-0 min-w-40 sm:max-w-none">
                      <NameCell
                        lead={<LogoTile src={p.logo_url} icon={<Building2 />} />}
                        name={p.name}
                        to={`/platform/properties/${p.id}`}
                        meta={`${p.property_type_label} · ${p.locality} · ${p.status_label}`}
                      />
                      <div className="mt-1.5 pl-12 sm:hidden">
                        <VerificationBadge p={p} />
                      </div>
                    </TD>
                    <TD className="hidden text-[13px] md:table-cell">
                      <Link
                        to={`/platform/businesses/${p.organization_id}`}
                        className="text-foreground no-underline hover:underline"
                      >
                        {p.organization_name}
                      </Link>
                    </TD>
                    <TD className="hidden sm:table-cell">
                      <VerificationBadge p={p} />
                    </TD>
                    <TD className="hidden text-[13px] lg:table-cell">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <FileText className="size-3.5 text-subtle-foreground" />
                        {p.documents_count}
                      </span>
                      <span
                        className={cn(
                          'block text-xs',
                          p.proof_documents_count ? 'text-muted-foreground' : 'text-amber-700',
                        )}
                      >
                        {p.proof_documents_count
                          ? `${p.proof_documents_count} proof`
                          : 'No proof yet'}
                      </span>
                    </TD>
                    <TD
                      className={cn(
                        'hidden text-[13px] whitespace-nowrap lg:table-cell',
                        waitingLong ? 'font-medium text-amber-700' : 'text-muted-foreground',
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {queue && <Clock className="size-3.5" />}
                        {relativeTime(when)}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <Button size="sm" variant={queue ? 'default' : 'outline'} asChild>
                        <Link to={`/platform/properties/${p.id}`}>{queue ? 'Review' : 'Open'}</Link>
                      </Button>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
        {count > 0 && (
          <Pager
            summary={plural(count, 'property', 'properties')}
            page={page}
            pages={pages}
            onPage={(n) => update({ page: String(n) })}
          />
        )}
      </Card>
    </>
  )
}
