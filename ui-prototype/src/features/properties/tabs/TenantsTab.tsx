import { UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Avatar, FilterChips, SearchBox, Status, Toolbar } from '../../../components/common'
import { Button } from '../../../components/ui-kit/button'
import { EmptyState } from '../../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui-kit/table'
import { TENANT_STATUS, placeLabel } from '../../../data/selectors'
import { useDb } from '../../../data/store'
import type { Property, TenantStatus } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { formatDate, formatMoney, plural } from '../../../lib/format'

type F = 'all' | Exclude<TenantStatus, 'moved_out'>

export function TenantsTab({ property }: { property: Property }) {
  const { can } = useSession()
  const navigate = useNavigate()
  const db = useDb((d) => d)
  const tenants = db.tenants
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<F>('all')
  const money = can('rent.view')

  const here = useMemo(
    () => tenants.filter((t) => t.propertyId === property.id && t.status !== 'moved_out'),
    [tenants, property.id],
  )
  const places = useMemo(() => new Map(here.map((t) => [t.id, placeLabel(db, t)])), [here, db])

  const q = query.trim().toLowerCase()
  const shown = here
    .filter((t) => filter === 'all' || t.status === filter)
    .filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
        (places.get(t.id) ?? '').toLowerCase().includes(q),
    )
    .sort((a, b) =>
      (places.get(a.id) ?? '').localeCompare(places.get(b.id) ?? '', 'en', { numeric: true }),
    )

  const count = (s: F) => here.filter((t) => s === 'all' || t.status === s).length

  return (
    <div>
      <Toolbar>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search name, phone or room"
          className="max-w-sm"
        />
        <FilterChips
          label="Tenant status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: count('all') },
            { value: 'active', label: 'Staying', count: count('active') },
            { value: 'notice', label: 'On notice', count: count('notice') },
            { value: 'upcoming', label: 'Moving in soon', count: count('upcoming') },
          ]}
        />
        <span className="flex-1" />
        {can('tenants.manage') && (
          <Button onClick={() => navigate(`/app/tenants/new?property=${property.id}`)}>
            <UserPlus /> Add tenant
          </Button>
        )}
      </Toolbar>
      {shown.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={here.length ? 'No tenants match' : 'No tenants here yet'}
        >
          {here.length
            ? 'Try another name or clear the filter.'
            : 'Add a tenant to a free bed from the Rooms & beds tab.'}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="border-b px-4 py-2.5 text-[13px] text-muted-foreground">
            {plural(shown.length, 'tenant')}
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Place</TH>
                {money && <TH className="text-right">Rent</TH>}
                <TH>Status</TH>
                <TH>Phone</TH>
              </TR>
            </THead>
            <TBody>
              {shown.map((t) => (
                <TR
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/app/tenants/${t.id}`)}
                >
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={t.name} hue={t.photoHue} size="sm" />
                      <div className="min-w-0">
                        <Link
                          to={`/app/tenants/${t.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium whitespace-nowrap hover:underline"
                        >
                          {t.name}
                        </Link>
                        <p className="text-xs whitespace-nowrap text-muted-foreground">
                          Since {formatDate(t.checkIn)}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">{places.get(t.id)}</TD>
                  {money && <TD className="text-right tabular-nums">{formatMoney(t.rent)}</TD>}
                  <TD>
                    <Status of={TENANT_STATUS} value={t.status} />
                    {t.status === 'notice' && t.moveOutOn && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Leaves {formatDate(t.moveOutOn)}
                      </p>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">
                    <a
                      href={`tel:${t.phone.replace(/\s/g, '')}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline"
                    >
                      {t.phone}
                    </a>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}
