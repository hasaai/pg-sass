import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Eye,
  LogIn,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRoundCheck,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useList } from '../../api/hooks'
import type { Property, Tenant } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import {
  EmptyState,
  ErrorAlert,
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
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney, initials, plural } from '../../lib/format'
import { displayPhone, useTenantCounts, useTenants, whatsappLink } from './api'
import { CheckInDialog, TenantDialog } from './dialogs'
import { TENANT_SORT, TENANT_TABS, tenantStatus } from './labels'

const PAGE_SIZE = 20

export function StatusBadge({ t }: { t: Pick<Tenant, 'current_stay' | 'moved_out_on'> }) {
  const s = tenantStatus(t)
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  )
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

/** Where the tenant stays now, or when they left. */
function StayCell({ t }: { t: Tenant }) {
  const s = t.current_stay
  if (s)
    return (
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium">{s.place.property_name}</p>
        <p className="truncate text-xs text-muted-foreground">{s.place.label}</p>
      </div>
    )
  if (t.moved_out_on)
    return (
      <span className="text-[13px] text-muted-foreground">
        Left on {formatDate(t.moved_out_on)}
      </span>
    )
  return <span className="text-[13px] text-muted-foreground">No room yet</span>
}

export function TenantsListPage() {
  useBreadcrumbs([{ label: 'Tenants' }])
  const { can } = useAuth()
  const canManage = can('tenants.manage')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const property = params.get('property') ?? ''
  const ordering = params.get('ordering') ?? 'name'
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const [search, setSearch] = useState(q)
  const [adding, setAdding] = useState(false)
  const [checkingIn, setCheckingIn] = useState<Tenant | null>(null)

  const properties = useList<Property>('/properties/')
  const counts = useTenantCounts({ q: q || undefined, property: property || undefined })
  const list = useTenants({
    q: q || undefined,
    status: status || undefined,
    property: property || undefined,
    ordering,
    page,
    page_size: PAGE_SIZE,
  })
  const rows = list.data?.results ?? []
  const count = list.data?.count ?? 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const filtered = Boolean(q || status || property)
  const c = counts.data

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
        title="Tenants"
        description="Everyone who stays, is about to stay, or has stayed with you."
        actions={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add tenant
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {counts.isLoading || !c ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Living here now"
              value={c.active + c.notice}
              icon={<Users />}
              hint={`${c.active} staying · ${c.notice} leaving soon`}
            />
            <StatCard
              label="Leaving soon"
              value={c.notice}
              icon={<CalendarClock />}
              hint={c.notice ? 'Gave notice' : 'Nobody on notice'}
            />
            <StatCard
              label="Not checked in"
              value={c.never}
              icon={<LogIn />}
              hint={c.never ? 'Added but no room yet' : 'Everyone has a place'}
            />
            <StatCard label="Moved out" value={c.past} icon={<UserRoundCheck />} />
          </>
        )}
      </div>

      <Card>
        <div className="grid gap-3 border-b p-3">
          <div
            role="tablist"
            aria-label="Filter by status"
            className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-secondary p-0.5"
          >
            {TENANT_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={status === tab.value}
                onClick={() => update({ status: tab.value || null })}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground',
                  status === tab.value && 'bg-card text-foreground shadow-xs',
                )}
              >
                {tab.label}
                {c && (
                  <span className="rounded-full bg-background/70 px-1.5 text-[11px] tabular-nums">
                    {c[tab.count]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
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
                aria-label="Search by name, mobile or email"
                placeholder="Search by name, mobile or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card pr-3 pl-8 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
              />
            </form>
            <div className="flex gap-2">
              <NativeSelect
                aria-label="Property"
                value={property}
                onChange={(e) => update({ property: e.target.value || null })}
                className="w-auto min-w-40"
              >
                <option value="">All properties</option>
                {properties.rows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label="Sort by"
                value={ordering}
                onChange={(e) => update({ ordering: e.target.value })}
                className="w-auto min-w-36"
              >
                {TENANT_SORT.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </div>

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
            icon={<Users />}
            title={filtered ? 'No tenants match' : 'No tenants yet'}
            actions={
              filtered ? (
                <Button variant="outline" onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </Button>
              ) : (
                canManage && (
                  <Button onClick={() => setAdding(true)}>
                    <Plus /> Add your first tenant
                  </Button>
                )
              )
            }
          >
            {filtered
              ? 'Try another search, status or property.'
              : 'Add a tenant with just a name and mobile, and give them a bed, room or flat.'}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Tenant</TH>
                <TH className="hidden md:table-cell">Status</TH>
                <TH className="hidden md:table-cell">Staying in</TH>
                <TH className="hidden lg:table-cell">Rent</TH>
                <TH className="hidden xl:table-cell">Since</TH>
                <TH className="w-12">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((t) => {
                const s = t.current_stay
                return (
                  <TR key={t.id}>
                    <TD>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={t.full_name} />
                        <div className="min-w-0">
                          <Link
                            to={`/app/tenants/${t.id}`}
                            className="block truncate font-medium text-foreground no-underline hover:underline"
                          >
                            {t.full_name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {displayPhone(t.phone)}
                            {t.occupation ? ` · ${t.occupation}` : ''}
                          </p>
                          <div className="mt-1 md:hidden">
                            <StatusBadge t={t} />
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden md:table-cell">
                      <StatusBadge t={t} />
                      {s?.status === 'notice' && s.expected_checkout && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Leaves {formatDate(s.expected_checkout)}
                        </p>
                      )}
                    </TD>
                    <TD className="hidden max-w-60 md:table-cell">
                      <StayCell t={t} />
                    </TD>
                    <TD className="hidden text-[13px] tabular-nums lg:table-cell">
                      {s ? formatMoney(s.monthly_rent) : '—'}
                    </TD>
                    <TD className="hidden text-[13px] text-muted-foreground xl:table-cell">
                      {s ? formatDate(s.check_in) : '—'}
                    </TD>
                    <TD>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${t.full_name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem
                            icon={<Eye />}
                            onSelect={() => navigate(`/app/tenants/${t.id}`)}
                          >
                            Open
                          </MenuItem>
                          <MenuItem
                            icon={<Phone />}
                            onSelect={() => window.open(`tel:${t.phone}`, '_self')}
                          >
                            Call
                          </MenuItem>
                          <MenuItem
                            icon={<MessageCircle />}
                            onSelect={() =>
                              window.open(whatsappLink(t.phone), '_blank', 'noopener')
                            }
                          >
                            WhatsApp
                          </MenuItem>
                          {canManage && !s && (
                            <>
                              <MenuSeparator />
                              <MenuItem icon={<LogIn />} onSelect={() => setCheckingIn(t)}>
                                Check in
                              </MenuItem>
                            </>
                          )}
                          {canManage && (
                            <MenuItem
                              icon={<Pencil />}
                              onSelect={() => navigate(`/app/tenants/${t.id}?edit=1`)}
                            >
                              Edit details
                            </MenuItem>
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
              {plural(count, 'tenant')} · Page {page} of {pages}
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

      <TenantDialog
        open={adding}
        onOpenChange={setAdding}
        onSaved={(t) => navigate(`/app/tenants/${t.id}`)}
      />
      {checkingIn && (
        <CheckInDialog open onOpenChange={(o) => !o && setCheckingIn(null)} tenant={checkingIn} />
      )}
    </>
  )
}
