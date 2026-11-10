import { ArrowRight, BedDouble, Building2, History, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router'

import { useApi } from '../../api/hooks'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { Alert, ErrorAlert, Meter, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { relativeTime } from '../../lib/format'
import { Avatar, InlineEmpty, Kpi, LogoTile, TableSkeleton } from './parts'
import type { Activity, Overview, PropertyPage } from './types'
import { actionWords } from './types'

export function PlatformOverviewPage() {
  useBreadcrumbs([{ label: 'Platform overview' }])
  const overview = useApi<Overview>('/platform/overview')
  const queue = useApi<PropertyPage>('/platform/properties/', {
    verification_status: 'submitted',
    page_size: 5,
  })
  const activity = useApi<Activity[]>('/platform/activity')
  const o = overview.data

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Every business on PG Manager, at a glance."
      />
      <ErrorAlert error={overview.error} className="mb-5" />
      {!o ? (
        <div
          className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4"
          role="status"
          aria-label="Loading"
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[112px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi
            label="Businesses"
            value={o.businesses}
            icon={<Building2 />}
            to="/platform/businesses"
            tone={o.businesses_suspended ? 'bad' : undefined}
            hint={o.businesses_suspended ? `${o.businesses_suspended} suspended` : 'None suspended'}
          />
          <Kpi
            label="Waiting for verification"
            value={o.awaiting_verification}
            icon={<ShieldCheck />}
            to="/platform/verification"
            tone={o.awaiting_verification ? 'warn' : 'good'}
            hint={`${o.verified} verified`}
          />
          <Kpi
            label="Beds filled"
            value={o.beds ? `${Math.round((o.beds_occupied / o.beds) * 100)}%` : '—'}
            icon={<BedDouble />}
            hint={`${o.beds_occupied} of ${o.beds} beds · ${o.properties_open} open properties`}
          >
            {o.beds > 0 && (
              <div className="mt-2.5">
                <Meter value={o.beds_occupied} max={o.beds} label="Beds filled on the platform" />
              </div>
            )}
          </Kpi>
          <Kpi
            label="People"
            value={o.users}
            icon={<Users />}
            tone={o.documents_expiring ? 'warn' : undefined}
            hint={
              o.documents_expiring
                ? `${o.documents_expiring} documents expired or expiring`
                : 'All documents in date'
            }
          />
        </div>
      )}

      {o && o.documents_expiring > 0 && (
        <Alert tone="warn" className="mb-5">
          Expired or soon-expiring documents are shown on each property’s review page.
        </Alert>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-5">
        <Card className="overflow-hidden xl:col-span-3">
          <CardHeader
            title="Waiting for verification"
            description="Oldest first."
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link to="/platform/verification">See all</Link>
              </Button>
            }
          />
          {queue.isLoading ? (
            <div className="border-t">
              <TableSkeleton rows={4} />
            </div>
          ) : (queue.data?.results.length ?? 0) === 0 ? (
            <CardContent>
              <InlineEmpty icon={<ShieldCheck />}>Nothing to check right now.</InlineEmpty>
            </CardContent>
          ) : (
            <ul className="divide-y border-t">
              {queue.data!.results.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/platform/properties/${p.id}`}
                    className="group flex items-center gap-3 px-5 py-3 text-foreground no-underline transition-colors hover:bg-secondary/45"
                  >
                    <LogoTile src={p.logo_url} icon={<Building2 />} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.organization_name} · {p.locality} · {p.proof_documents_count} proof
                        document{p.proof_documents_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {p.submitted_at ? `Sent ${relativeTime(p.submitted_at)}` : ''}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title="Recent activity"
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link to="/platform/activity">See all</Link>
              </Button>
            }
          />
          {activity.isLoading ? (
            <div className="border-t">
              <TableSkeleton rows={5} />
            </div>
          ) : (activity.data ?? []).length === 0 ? (
            <CardContent>
              <InlineEmpty icon={<History />}>Nothing recorded yet.</InlineEmpty>
            </CardContent>
          ) : (
            <ul className="divide-y border-t">
              {(activity.data ?? []).slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <Avatar name={a.actor ?? 'System'} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{actionWords(a.action)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.organization_name}
                      {a.actor ? ` · ${a.actor}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
