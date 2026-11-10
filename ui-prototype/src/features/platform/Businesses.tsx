import { Building, Download } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { Avatar, FilterChips, SearchBox, Status, Toolbar } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { NativeSelect } from '../../components/ui-kit/input'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { OWNER_CHECK } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { OwnerCheckStatus, PlatformBusiness } from '../../data/types'
import { formatDate, plural } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { useExtras } from './extras'
import { BUSINESS_STATUS, PLAN_STATUS, daysAgo } from './util'

type StatusFilter = 'all' | PlatformBusiness['planStatus'] | 'suspended'

export function Businesses() {
  useBreadcrumbs([{ label: 'Businesses' }])
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const businesses = useDb((db) => db.platformBusinesses)
  const plans = useExtras((x) => x.plans)

  const q = params.get('q') ?? ''
  const plan = params.get('plan') ?? ''
  const status = (params.get('status') ?? 'all') as StatusFilter
  const check = params.get('check') ?? ''

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return businesses
      .filter(
        (b) =>
          !term || [b.name, b.owner, b.phone, b.city].some((v) => v.toLowerCase().includes(term)),
      )
      .filter((b) => !plan || b.plan === plan)
      .filter((b) =>
        status === 'all'
          ? true
          : status === 'suspended'
            ? b.status === 'suspended'
            : b.planStatus === status,
      )
      .filter((b) => !check || b.ownerCheck === check)
      .sort((a, b) => b.lastActive.localeCompare(a.lastActive))
  }, [businesses, q, plan, status, check])

  const count = (fn: (b: PlatformBusiness) => boolean) => businesses.filter(fn).length
  const planName = (code: string) => plans.find((p) => p.code === code)?.name ?? code
  const filtered = q || plan || status !== 'all' || check

  return (
    <>
      <PageHeader
        title="Businesses"
        description={`${plural(businesses.length, 'PG business', 'PG businesses')} using PG Manager`}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              toast.success(
                `List of ${plural(rows.length, 'business', 'businesses')} downloaded as CSV`,
              )
            }
          >
            <Download /> Download list
          </Button>
        }
      />

      <Toolbar>
        <SearchBox
          value={q}
          onChange={(v) => setParam('q', v)}
          placeholder="Search by business, owner, phone or area"
          className="w-full sm:max-w-sm"
        />
        <NativeSelect
          aria-label="Plan"
          value={plan}
          onChange={(e) => setParam('plan', e.target.value)}
          className="w-auto min-w-36"
        >
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Owner check"
          value={check}
          onChange={(e) => setParam('check', e.target.value)}
          className="w-auto min-w-44"
        >
          <option value="">Any owner check</option>
          {(Object.keys(OWNER_CHECK) as OwnerCheckStatus[]).map((k) => (
            <option key={k} value={k}>
              {OWNER_CHECK[k].label}
            </option>
          ))}
        </NativeSelect>
      </Toolbar>
      <div className="mb-4">
        <FilterChips<StatusFilter>
          label="Plan status"
          value={status}
          onChange={(v) => setParam('status', v)}
          options={[
            { value: 'all', label: 'All', count: businesses.length },
            { value: 'active', label: 'Paying', count: count((b) => b.planStatus === 'active') },
            { value: 'trial', label: 'Free trial', count: count((b) => b.planStatus === 'trial') },
            {
              value: 'past_due',
              label: 'Payment failed',
              count: count((b) => b.planStatus === 'past_due'),
            },
            { value: 'ended', label: 'Plan ended', count: count((b) => b.planStatus === 'ended') },
            {
              value: 'suspended',
              label: 'Suspended',
              count: count((b) => b.status === 'suspended'),
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Building />}
          title="No business matches"
          actions={
            filtered && (
              <Button variant="outline" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </Button>
            )
          }
        >
          Try another name, phone number or area, or clear the filters.
        </EmptyState>
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <THead>
              <TR>
                <TH>Business</TH>
                <TH>Owner</TH>
                <TH>Area</TH>
                <TH>Plan</TH>
                <TH className="text-right">Properties</TH>
                <TH className="text-right">Beds</TH>
                <TH className="text-right">Tenants</TH>
                <TH>Joined</TH>
                <TH>Last active</TH>
                <TH>Owner check</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((b) => (
                <TR
                  key={b.id}
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => navigate(`/platform/businesses/${b.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/platform/businesses/${b.id}`)}
                >
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={b.name} hue={(Number(b.id.slice(1)) * 47) % 360} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium whitespace-nowrap">{b.name}</p>
                        {b.status === 'suspended' && (
                          <Status of={BUSINESS_STATUS} value="suspended" />
                        )}
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <p className="whitespace-nowrap">{b.owner}</p>
                    <p className="text-xs whitespace-nowrap text-muted-foreground">{b.phone}</p>
                  </TD>
                  <TD className="whitespace-nowrap">{b.city}</TD>
                  <TD>
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone="outline">{planName(b.plan)}</Badge>
                      <Status of={PLAN_STATUS} value={b.planStatus} />
                    </div>
                  </TD>
                  <TD className="text-right tabular-nums">{b.properties}</TD>
                  <TD className="text-right tabular-nums">{b.beds}</TD>
                  <TD className="text-right tabular-nums">{b.tenants}</TD>
                  <TD className="whitespace-nowrap">{formatDate(b.joinedOn)}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {daysAgo(b.lastActive)}
                  </TD>
                  <TD>
                    <Status of={OWNER_CHECK} value={b.ownerCheck} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            Showing {rows.length} of {businesses.length}
          </p>
        </div>
      )}
    </>
  )
}
