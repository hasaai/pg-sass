import {
  BedDouble,
  Building2,
  LayoutGrid,
  List,
  MapPin,
  Percent,
  Plus,
  UserPlus,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { FilterChips, PhotoTile, SearchBox, Status, Toolbar } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { EmptyState, Meter, PageHeader, StatCard } from '../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { Tooltip } from '../../components/ui-kit/tooltip'
import { GENDER, PROPERTY_STATUS, PROPERTY_TYPE, VERIFICATION } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { Property, PropertyStatus } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { bedCounts, rentRangeLabel } from './lib'

type Filter = 'all' | PropertyStatus

const TYPE_SHORT = {
  pg: 'PG',
  hostel: 'Hostel',
  coliving: 'Co-living',
  apartment: 'Apartment',
} as const

export function PropertiesList() {
  useBreadcrumbs([{ label: 'Properties' }])
  const { can } = useSession()
  const navigate = useNavigate()
  const properties = useDb((db) => db.properties)
  const rooms = useDb((db) => db.rooms)
  const beds = useDb((db) => db.beds)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const showMoney = can('rent.view')

  const stats = useMemo(() => {
    const map = new Map<
      string,
      { counts: ReturnType<typeof bedCounts>; rent: string; rooms: number }
    >()
    for (const p of properties) {
      const pr = rooms.filter((r) => r.propertyId === p.id)
      map.set(p.id, {
        counts: bedCounts(beds.filter((b) => b.propertyId === p.id)),
        rent: rentRangeLabel(pr),
        rooms: pr.length,
      })
    }
    return map
  }, [properties, rooms, beds])

  const live = properties.filter((p) => p.status !== 'archived')
  const liveIds = new Set(live.map((p) => p.id))
  const all = bedCounts(beds.filter((b) => liveIds.has(b.propertyId)))
  const count = (s: PropertyStatus) => properties.filter((p) => p.status === s).length

  const q = query.trim().toLowerCase()
  const shown = properties.filter(
    (p) =>
      (filter === 'all' ? p.status !== 'archived' : p.status === filter) &&
      (!q ||
        [p.name, p.locality, p.reference, p.address, p.pincode].some((v) =>
          v.toLowerCase().includes(q),
        )),
  )

  const options: { value: Filter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: live.length },
    { value: 'active', label: 'Open', count: count('active') },
    { value: 'draft', label: 'Not finished', count: count('draft') },
    { value: 'inactive', label: 'Closed for now', count: count('inactive') },
  ]
  if (count('archived') > 0)
    options.push({ value: 'archived', label: 'Archived', count: count('archived') })

  return (
    <div>
      <PageHeader
        title="Properties"
        description="Your PGs and hostels, their rooms and beds."
        actions={
          can('properties.manage') && (
            <Button onClick={() => navigate('/app/properties/new')}>
              <Plus /> Add property
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Properties"
          value={live.length}
          icon={<Building2 />}
          hint={`${count('active')} open · ${count('draft')} not finished`}
        />
        <StatCard
          label="Beds"
          value={all.total}
          icon={<BedDouble />}
          hint={plural(rooms.filter((r) => liveIds.has(r.propertyId)).length, 'room')}
        />
        <StatCard label="Beds filled" value={`${all.pct}%`} icon={<Percent />}>
          <div className="mt-2">
            <Meter value={all.filled} max={all.total} label="Beds filled across properties" />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {all.filled} of {all.total} beds
          </p>
        </StatCard>
        <StatCard
          label="Vacant beds"
          value={<span className="text-emerald-700">{all.vacant}</span>}
          hint={`${all.reserved} reserved · ${all.notice} on notice`}
        />
      </div>

      <Toolbar>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search by name, area or PG number"
          className="max-w-md"
        />
        <FilterChips label="Status" options={options} value={filter} onChange={setFilter} />
        <span className="flex-1" />
        <div className="inline-flex rounded-lg border bg-card p-0.5" role="group" aria-label="View">
          {(
            [
              ['grid', LayoutGrid, 'Cards'],
              ['list', List, 'List'],
            ] as const
          ).map(([v, Icon, label]) => (
            <Tooltip key={v} content={`Show as ${label.toLowerCase()}`}>
              <button
                type="button"
                aria-pressed={view === v}
                aria-label={`Show as ${label.toLowerCase()}`}
                onClick={() => setView(v)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px]',
                  view === v
                    ? 'bg-secondary font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      </Toolbar>

      <p className="mb-3 text-[13px] text-muted-foreground">
        Showing {plural(shown.length, 'property', 'properties')}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={properties.length ? 'No properties match' : 'No properties yet'}
          actions={
            properties.length ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
              >
                Clear search
              </Button>
            ) : (
              can('properties.manage') && (
                <Button onClick={() => navigate('/app/properties/new')}>
                  <Plus /> Add property
                </Button>
              )
            )
          }
        >
          {properties.length
            ? 'Try another name or area, or clear the filters.'
            : 'Add your first PG to start adding rooms, beds and tenants.'}
        </EmptyState>
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <PropertyCard key={p.id} p={p} s={stats.get(p.id)!} showMoney={showMoney} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Table>
            <THead>
              <TR>
                <TH>Property</TH>
                <TH>Status</TH>
                <TH>Beds filled</TH>
                <TH className="text-right">Vacant</TH>
                {showMoney && <TH className="text-right">Rent</TH>}
              </TR>
            </THead>
            <TBody>
              {shown.map((p) => {
                const s = stats.get(p.id)!
                return (
                  <TR
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/properties/${p.id}`)}
                  >
                    <TD>
                      <div className="flex items-center gap-3">
                        <PhotoTile
                          hue={p.photos[0]?.hue ?? 220}
                          className="w-14 shrink-0 rounded-md"
                        />
                        <div className="min-w-0">
                          <Link
                            to={`/app/properties/${p.id}`}
                            className="font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {p.locality} · {TYPE_SHORT[p.type]} · {GENDER[p.gender]}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Status of={PROPERTY_STATUS} value={p.status} />
                        <Status of={VERIFICATION} value={p.verification} />
                      </div>
                    </TD>
                    <TD className="min-w-40">
                      <Meter
                        value={s.counts.filled}
                        max={s.counts.total}
                        label={`Beds filled in ${p.name}`}
                      />
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {s.counts.filled} of {s.counts.total} beds
                      </p>
                    </TD>
                    <TD className="text-right tabular-nums">{s.counts.vacant}</TD>
                    {showMoney && (
                      <TD className="text-right whitespace-nowrap tabular-nums">{s.rent}</TD>
                    )}
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function PropertyCard({
  p,
  s,
  showMoney,
}: {
  p: Property
  s: { counts: ReturnType<typeof bedCounts>; rent: string; rooms: number }
  showMoney: boolean
}) {
  const { can } = useSession()
  const navigate = useNavigate()
  const c = s.counts
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-sm">
      <Link to={`/app/properties/${p.id}`} className="relative block" aria-label={`Open ${p.name}`}>
        <PhotoTile hue={p.photos[0]?.hue ?? 220} className="aspect-[16/7] rounded-none" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <Status of={PROPERTY_STATUS} value={p.status} />
        </div>
        <div className="absolute top-3 right-3">
          <Status of={VERIFICATION} value={p.verification} />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/app/properties/${p.id}`}
              className="block truncate text-base font-semibold hover:underline"
            >
              {p.name}
            </Link>
            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />{' '}
              <span className="truncate">
                {p.locality}, {p.city}
              </span>
            </p>
          </div>
          <span className="shrink-0 rounded border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {p.reference}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="outline">{PROPERTY_TYPE[p.type]}</Badge>
          <Badge tone="outline">{GENDER[p.gender]}</Badge>
          {p.foodIncluded && <Badge tone="outline">Food included</Badge>}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
            <span className="font-medium">
              {c.total ? `${c.filled} of ${c.total} beds filled` : 'No beds yet'}
            </span>
            <span className="text-muted-foreground tabular-nums">{c.pct}%</span>
          </div>
          <Meter value={c.filled} max={c.total} label={`Beds filled in ${p.name}`} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-emerald-700">{c.vacant}</span> vacant
            </span>
            <span>
              <span className="font-semibold text-orange-700">{c.notice}</span> on notice
            </span>
            <span>{plural(s.rooms, 'room')}</span>
            <span>{plural(p.floors, 'floor')}</span>
          </div>
        </div>

        {showMoney && (
          <p className="mt-3 text-[13px]">
            <span className="text-muted-foreground">Rent </span>
            <span className="font-medium tabular-nums">{s.rent}</span>
            <span className="text-muted-foreground"> a month</span>
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <Button size="sm" variant="outline" onClick={() => navigate(`/app/properties/${p.id}`)}>
            Open
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/app/properties/${p.id}?tab=rooms`)}
          >
            <BedDouble /> Rooms
          </Button>
          {can('tenants.manage') && p.status !== 'archived' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(`/app/tenants/new?property=${p.id}`)}
            >
              <UserPlus /> Add tenant
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
