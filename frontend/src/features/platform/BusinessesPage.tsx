import { Building2, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useApi } from '../../api/hooks'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Card } from '../../components/ui-kit/card'
import { EmptyState, ErrorAlert, PageHeader } from '../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { formatDate, plural } from '../../lib/format'
import {
  FilterBar,
  FilterChips,
  LogoTile,
  NameCell,
  Pager,
  SearchBox,
  TableSkeleton,
} from './parts'
import type { OrgPage } from './types'

const PAGE_SIZE = 25
const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
] as const

export function BusinessesPage() {
  useBreadcrumbs([{ label: 'Businesses' }])
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const [search, setSearch] = useState(q)
  const list = useApi<OrgPage>('/platform/organizations/', {
    q: q || undefined,
    status: status || undefined,
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
      <PageHeader title="Businesses" description="Every PG business using PG Manager." />
      <Card className="overflow-hidden">
        <FilterBar>
          <SearchBox
            label="Search by business name or owner email"
            value={search}
            onChange={setSearch}
            onSubmit={() => update({ q: search.trim() || null })}
          />
          <FilterChips
            label="Status"
            value={status as (typeof STATUS_FILTERS)[number]['value']}
            options={STATUS_FILTERS}
            onChange={(v) => update({ status: v || null })}
          />
        </FilterBar>
        <ErrorAlert error={list.error} className="m-4" />
        {list.isLoading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState className="m-4 border-0" icon={<Building2 />} title="No businesses match">
            {q || status ? 'Try another name or email, or show all statuses.' : null}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Business</TH>
                <TH className="hidden md:table-cell">Owner</TH>
                <TH className="hidden text-right lg:table-cell">Properties</TH>
                <TH className="hidden text-right lg:table-cell">Tenants</TH>
                <TH>Status</TH>
                <TH className="hidden xl:table-cell">Joined</TH>
                <TH className="w-10">
                  <span className="sr-only">Open</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((o) => (
                <TR key={o.id}>
                  <TD className="max-w-0 min-w-44 sm:max-w-none">
                    <NameCell
                      lead={<LogoTile src={o.logo_url} icon={<Building2 />} />}
                      name={o.name}
                      to={`/platform/businesses/${o.id}`}
                      meta={
                        o.awaiting_verification > 0 ? (
                          <span className="font-medium text-amber-700">
                            {plural(o.awaiting_verification, 'property', 'properties')} to verify
                          </span>
                        ) : (
                          o.contact_phone || '—'
                        )
                      }
                    />
                  </TD>
                  <TD className="hidden text-[13px] md:table-cell">
                    {o.owners[0]?.full_name ?? '—'}
                    <span className="block text-xs text-muted-foreground">
                      {o.owners[0]?.email}
                    </span>
                  </TD>
                  <TD className="hidden text-right text-[13px] lg:table-cell">
                    <span className="font-medium">{o.properties_count}</span>
                    <span className="block text-xs text-muted-foreground">{o.beds_total} beds</span>
                  </TD>
                  <TD className="hidden text-right text-[13px] font-medium lg:table-cell">
                    {o.tenants_count}
                  </TD>
                  <TD>
                    <Badge tone={o.status === 'active' ? 'good' : 'bad'} dot>
                      {o.status_label}
                    </Badge>
                  </TD>
                  <TD className="hidden text-[13px] whitespace-nowrap text-muted-foreground xl:table-cell">
                    {formatDate(o.created_at.slice(0, 10))}
                  </TD>
                  <TD className="pl-0">
                    <Link
                      to={`/platform/businesses/${o.id}`}
                      aria-label={`Open ${o.name}`}
                      className="flex size-8 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {count > 0 && (
          <Pager
            summary={plural(count, 'business', 'businesses')}
            page={page}
            pages={pages}
            onPage={(n) => update({ page: String(n) })}
          />
        )}
      </Card>
    </>
  )
}
