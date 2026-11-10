import {
  Archive,
  ArchiveRestore,
  BedDouble,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { ApiError } from '../../api/client'
import { useList } from '../../api/hooks'
import type { Property } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import {
  Alert,
  EmptyState,
  ErrorAlert,
  Meter,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../components/ui-kit/feedback'
import { NativeSelect } from '../../components/ui-kit/input'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui-kit/menu'
import { toast } from '../../components/ui-kit/toast'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { cn } from '../../lib/cn'
import { plural, relativeTime } from '../../lib/format'
import { statusActions, useBulkAction, useProperties, useStatusAction } from './api'
import type { StatusAction } from './api'
import { PROPERTY_STATUS_TONE, SORT_OPTIONS, STATUS_FILTERS } from './labels'
import { PROPERTY_TYPES, typeInfo } from './propertyTypes'

const PAGE_SIZE = 20
const ACTION_ICONS: Record<StatusAction, ReactNode> = {
  activate: <Power />,
  deactivate: <PowerOff />,
  archive: <Archive />,
  restore: <ArchiveRestore />,
}

function StatusBadge({ p }: { p: Pick<Property, 'status' | 'status_label'> }) {
  return (
    <Badge tone={PROPERTY_STATUS_TONE[p.status]} dot>
      {p.status_label}
    </Badge>
  )
}

/** "18 of 24 beds filled" for shared living, "2 of 4 flats" style counts otherwise. */
function Occupancy({ p }: { p: Property }) {
  if (p.beds_total > 0) {
    return (
      <div className="w-36">
        <div className="mb-1 flex justify-between text-xs">
          <span className="font-medium tabular-nums">
            {p.beds_occupied} of {p.beds_total}
          </span>
          <span className="text-muted-foreground">beds filled</span>
        </div>
        <Meter value={p.beds_occupied} max={p.beds_total} label={`${p.name} beds filled`} />
      </div>
    )
  }
  const info = typeInfo(p.property_type)
  if (p.units_count > 0 && info.unitWord) {
    return (
      <span className="text-[13px] text-muted-foreground">
        {plural(p.units_count, info.unitWord.toLowerCase())}
      </span>
    )
  }
  return <span className="text-[13px] text-muted-foreground">Nothing to rent yet</span>
}

function Structure({ p }: { p: Property }) {
  const info = typeInfo(p.property_type)
  const parts = [
    p.floors_count ? plural(p.floors_count, 'floor') : null,
    info.unitWord && p.units_count ? plural(p.units_count, info.unitWord.toLowerCase()) : null,
    p.rooms_count ? plural(p.rooms_count, 'room') : null,
  ].filter(Boolean)
  return (
    <span className="text-[13px] text-muted-foreground">{parts.join(' · ') || 'Not set up'}</span>
  )
}

function Summary() {
  const all = useList<Property>('/properties/', { status: 'all' })
  const rows = all.rows
  const open = rows.filter((p) => p.status === 'active').length
  const draft = rows.filter((p) => p.status === 'draft').length
  const beds = rows.reduce((n, p) => n + p.beds_total, 0)
  const filled = rows.reduce((n, p) => n + p.beds_occupied, 0)
  const live = rows.filter((p) => p.status !== 'archived').length
  if (all.isLoading)
    return (
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    )
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Properties" value={live} icon={<Building2 />} hint="Not counting removed" />
      <StatCard label="Open" value={open} icon={<CircleCheck />} hint="Taking tenants" />
      <StatCard
        label="Not finished"
        value={draft}
        icon={<CircleDashed />}
        hint={draft ? 'Finish setting these up' : 'All set up'}
      />
      <StatCard
        label="Beds filled"
        value={beds ? `${Math.round((filled / beds) * 100)}%` : '—'}
        icon={<BedDouble />}
        hint={beds ? `${filled} of ${beds} beds` : 'No beds yet'}
      >
        {beds > 0 && (
          <div className="mt-2">
            <Meter value={filled} max={beds} label="Beds filled across properties" />
          </div>
        )}
      </StatCard>
    </div>
  )
}

export function PropertiesListPage() {
  useBreadcrumbs([{ label: 'Properties' }])
  const { can, allProperties } = useAuth()
  const canManage = can('properties.manage')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const type = params.get('type') ?? ''
  const ordering = params.get('ordering') ?? 'name'
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const [search, setSearch] = useState(q)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ ids: string[]; names: string[] } | null>(null)

  const list = useProperties({
    q: q || undefined,
    status: status || undefined,
    property_type: type || undefined,
    ordering,
    page,
    page_size: PAGE_SIZE,
  })
  const rows = useMemo(() => list.data?.results ?? [], [list.data])
  const count = list.data?.count ?? 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const single = useStatusAction((p) => toast.success(`${p.name}: ${p.status_label}`))
  const bulk = useBulkAction(() => {
    toast.success('Done')
    setSelected(new Set())
    setConfirm(null)
  })

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v)
      else merged.delete(k)
    }
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
    setSelected(new Set())
  }

  function runSingle(p: Property, action: StatusAction) {
    if (action === 'archive') {
      setConfirm({ ids: [p.id], names: [p.name] })
      return
    }
    single.mutate(
      { id: p.id, action },
      { onError: (e) => toast.error(e.message || 'That did not work.') },
    )
  }

  function runBulk(action: StatusAction, ids: string[]) {
    bulk.mutate({ action, ids })
  }

  const selectedRows = rows.filter((r) => selected.has(r.id))
  const allChecked = rows.length > 0 && selectedRows.length === rows.length
  const filtered = Boolean(q || status || type)
  const bulkErrors =
    bulk.error instanceof ApiError && Array.isArray(bulk.error.fields.items)
      ? (bulk.error.fields.items as { id: string; name: string; message: string }[])
      : []

  return (
    <>
      <PageHeader
        title="Properties"
        description="Every PG, co-living space, hostel, flat and house you manage."
        actions={
          canManage &&
          allProperties && (
            <Button onClick={() => navigate('/app/properties/new')}>
              <Plus /> Add property
            </Button>
          )
        }
      />
      <Summary />

      <Card>
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center">
          <div
            role="tablist"
            aria-label="Filter by status"
            className="flex shrink-0 gap-1 overflow-x-auto rounded-lg bg-secondary p-0.5"
          >
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={status === f.value}
                onClick={() => update({ status: f.value || null })}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground',
                  status === f.value && 'bg-card text-foreground shadow-xs',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              update({ q: search.trim() || null })
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              data-slot="input"
              type="search"
              aria-label="Search by name, building or address"
              placeholder="Search by name, building or address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card pr-3 pl-8 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            />
          </form>
          <div className="flex gap-2">
            <NativeSelect
              aria-label="Type of place"
              value={type}
              onChange={(e) => update({ type: e.target.value || null })}
              className="w-auto min-w-40"
            >
              <option value="">All types</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Sort by"
              value={ordering}
              onChange={(e) => update({ ordering: e.target.value })}
              className="w-auto min-w-40"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-accent px-4 py-2 text-sm">
            <span className="font-medium">{selectedRows.length} selected</span>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <Button
              size="sm"
              variant="outline"
              busy={bulk.isPending}
              onClick={() =>
                runBulk(
                  'activate',
                  selectedRows.map((r) => r.id),
                )
              }
            >
              <Power /> Open
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                runBulk(
                  'deactivate',
                  selectedRows.map((r) => r.id),
                )
              }
            >
              <PowerOff /> Close
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setConfirm({
                  ids: selectedRows.map((r) => r.id),
                  names: selectedRows.map((r) => r.name),
                })
              }
            >
              <Archive /> Remove
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                runBulk(
                  'restore',
                  selectedRows.map((r) => r.id),
                )
              }
            >
              <ArchiveRestore /> Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X /> Clear
            </Button>
          </div>
        )}

        {bulkErrors.length > 0 && !confirm && (
          <div className="border-b p-3">
            <Alert tone="bad" title="Nothing was changed. Fix these first:">
              <ul className="list-disc pl-5">
                {bulkErrors.map((e) => (
                  <li key={e.id}>
                    <strong>{e.name}</strong>: {e.message}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        )}
        <ErrorAlert error={list.error} className="m-3" />

        {list.isLoading ? (
          <div className="grid gap-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            className="m-4 border-0"
            icon={<Building2 />}
            title={filtered ? 'No properties match' : 'No properties yet'}
            actions={
              filtered ? (
                <Button variant="outline" onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </Button>
              ) : (
                canManage &&
                allProperties && (
                  <Button onClick={() => navigate('/app/properties/new')}>
                    <Plus /> Add your first property
                  </Button>
                )
              )
            }
          >
            {filtered
              ? 'Try another search, status or type.'
              : 'Add your PG, co-living space, hostel, flat or house, then its rooms and beds.'}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                {canManage && (
                  <TH className="w-10">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={allChecked ? true : selectedRows.length ? 'indeterminate' : false}
                      onCheckedChange={(v) =>
                        setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())
                      }
                    />
                  </TH>
                )}
                <TH>Property</TH>
                <TH className="hidden md:table-cell">Type</TH>
                <TH className="hidden md:table-cell">Status</TH>
                <TH className="hidden lg:table-cell">Occupancy</TH>
                <TH className="hidden xl:table-cell">Set-up</TH>
                <TH className="hidden lg:table-cell">Updated</TH>
                <TH className="w-12">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => {
                const info = typeInfo(p.property_type)
                const checked = selected.has(p.id)
                return (
                  <TR key={p.id} data-state={checked ? 'selected' : undefined}>
                    {canManage && (
                      <TD>
                        <Checkbox
                          aria-label={`Select ${p.name}`}
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = new Set(selected)
                            if (v === true) next.add(p.id)
                            else next.delete(p.id)
                            setSelected(next)
                          }}
                        />
                      </TD>
                    )}
                    <TD>
                      <div className="flex min-w-0 items-center gap-3">
                        {p.logo_url || p.photos[0] ? (
                          <img
                            src={p.logo_url ?? p.photos[0]!.url}
                            alt=""
                            className="size-10 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                            <Building2 className="size-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <Link
                            to={`/app/properties/${p.id}`}
                            className="block truncate font-medium text-foreground no-underline hover:underline"
                          >
                            {p.name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {[p.building_name, p.locality, p.city].filter(Boolean).join(', ')}
                          </p>
                          <div className="mt-1 md:hidden">
                            <StatusBadge p={p} />
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden md:table-cell">
                      <span className="text-[13px]">{info.label}</span>
                    </TD>
                    <TD className="hidden md:table-cell">
                      <StatusBadge p={p} />
                    </TD>
                    <TD className="hidden lg:table-cell">
                      <Occupancy p={p} />
                    </TD>
                    <TD className="hidden xl:table-cell">
                      <Structure p={p} />
                    </TD>
                    <TD className="hidden text-[13px] text-muted-foreground lg:table-cell">
                      {relativeTime(p.updated_at)}
                    </TD>
                    <TD>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${p.name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem
                            icon={<Eye />}
                            onSelect={() => navigate(`/app/properties/${p.id}`)}
                          >
                            View
                          </MenuItem>
                          {canManage && (
                            <>
                              <MenuItem
                                icon={<Pencil />}
                                onSelect={() => navigate(`/app/properties/${p.id}/edit`)}
                              >
                                Edit details
                              </MenuItem>
                              <MenuSeparator />
                              {statusActions(p.status).map((a) => (
                                <MenuItem
                                  key={a.action}
                                  icon={ACTION_ICONS[a.action]}
                                  destructive={a.action === 'archive'}
                                  onSelect={() => runSingle(p, a.action)}
                                >
                                  {a.label}
                                </MenuItem>
                              ))}
                            </>
                          )}
                        </MenuContent>
                      </Menu>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}

        {count > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-[13px] text-muted-foreground">
            <span>
              {plural(count, 'property', 'properties')} · Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                <ChevronLeft /> Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => update({ page: String(page + 1) })}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm && confirm.ids.length > 1
            ? `Remove ${confirm.ids.length} properties?`
            : `Remove ${confirm?.names[0] ?? 'property'}?`
        }
        confirmLabel="Remove"
        destructive
        busy={bulk.isPending}
        error={bulk.error}
        onConfirm={() => confirm && runBulk('archive', confirm.ids)}
      >
        <p>
          Removed properties disappear from your lists and can't take tenants. Nothing is deleted:
          old tenancies and invoices stay, and you can restore it any time from the “Removed”
          filter.
        </p>
      </ConfirmDialog>
    </>
  )
}
