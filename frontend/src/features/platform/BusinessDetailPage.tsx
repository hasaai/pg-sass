import { Ban, BedDouble, Building2, History, Phone, Power, UserRound, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardFooter, CardHeader } from '../../components/ui-kit/card'
import { CheckboxRow } from '../../components/ui-kit/checkbox'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, ErrorAlert, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Textarea } from '../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { formatDate, relativeTime } from '../../lib/format'
import type { Activity, PlatformOrganization, PropertyPage } from './types'
import { PLATFORM_QUERIES, actionWords } from './types'
import {
  BackLink,
  InlineEmpty,
  Kpi,
  LogoTile,
  NameCell,
  PageSkeleton,
  TableSkeleton,
  TimelineItem,
} from './parts'
import { PlanCard } from './PlanCard'
import { VerificationBadge } from './PropertiesPage'

function FeaturesCard({ org }: { org: PlatformOrganization }) {
  const [off, setOff] = useState<Set<string>>(
    () => new Set(org.features.filter((f) => !f.enabled).map((f) => f.key)),
  )
  const save = useApiMutation(
    () =>
      api.put<PlatformOrganization>(`/platform/organizations/${org.id}/features/`, {
        disabled_features: [...off].sort(),
      }),
    PLATFORM_QUERIES,
    () => toast.success('Features saved'),
  )
  const changed =
    [...off].sort().join() !==
    org.features
      .filter((f) => !f.enabled)
      .map((f) => f.key)
      .sort()
      .join()
  return (
    <Card>
      <CardHeader
        title="Switch off features"
        description="Turns a feature off for this business even if its plan includes it. Properties, tenants, rent and the dashboard are always on."
      />
      <CardContent className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {org.features.map((f) => (
            <CheckboxRow
              className="rounded-lg border px-3 py-2.5 transition-colors hover:bg-secondary/40"
              key={f.key}
              label={f.label}
              hint={f.description}
              checked={!off.has(f.key)}
              onCheckedChange={(v) => {
                const next = new Set(off)
                if (v === true) next.delete(f.key)
                else next.add(f.key)
                setOff(next)
              }}
            />
          ))}
        </div>
        <ErrorAlert error={save.error} />
      </CardContent>
      <CardFooter className="justify-between">
        <p className="text-xs text-muted-foreground">
          {changed ? 'You have changes that are not saved.' : 'No changes.'}
        </p>
        <Button disabled={!changed} busy={save.isPending} onClick={() => save.mutate(undefined)}>
          Save features
        </Button>
      </CardFooter>
    </Card>
  )
}

function SuspendDialog({
  org,
  onOpenChange,
}: {
  org: PlatformOrganization
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState('')
  const suspend = useApiMutation(
    () => api.post(`/platform/organizations/${org.id}/suspend/`, { reason }),
    PLATFORM_QUERIES,
    () => {
      toast.success(`${org.name} suspended`)
      onOpenChange(false)
    },
  )
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={`Suspend ${org.name}?`}
      description="Nobody in this business can open it until you reactivate it. Their public listings are hidden. Nothing is deleted."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            busy={suspend.isPending}
            disabled={!reason.trim()}
            onClick={() => suspend.mutate(undefined)}
          >
            Suspend business
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field
          label="Reason"
          required
          hint="Kept with the business, e.g. “Subscription unpaid since 1 Oct”."
        >
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ErrorAlert error={suspend.error} fields={[]} />
      </div>
    </Dialog>
  )
}

export function BusinessDetailPage() {
  const { canPlatform } = useAuth()
  const { id = '' } = useParams()
  const org = useApi<PlatformOrganization>(`/platform/organizations/${id}/`)
  const properties = useApi<PropertyPage>('/platform/properties/', {
    organization: id,
    page_size: 100,
  })
  const activity = useApi<Activity[]>('/platform/activity', { organization: id })
  const [suspending, setSuspending] = useState(false)
  const reactivate = useApiMutation(
    () => api.post(`/platform/organizations/${id}/reactivate/`),
    PLATFORM_QUERIES,
    () => toast.success('Business reactivated'),
  )
  useBreadcrumbs([
    { label: 'Businesses', to: '/platform/businesses' },
    { label: org.data?.name ?? '…' },
  ])
  if (org.isLoading) return <PageSkeleton />
  if (!org.data)
    return (
      <EmptyState
        icon={<Building2 />}
        title="Business not found"
        actions={
          <Button variant="outline" asChild>
            <Link to="/platform/businesses">Back to businesses</Link>
          </Button>
        }
      >
        It may have been removed, or the link is wrong.
      </EmptyState>
    )
  const o = org.data
  const rows = properties.data?.results ?? []

  return (
    <>
      <PageHeader
        eyebrow={<BackLink to="/platform/businesses">Businesses</BackLink>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <LogoTile src={o.logo_url} icon={<Building2 />} />
            <span className="min-w-0 break-words">{o.name}</span>
            <Badge tone={o.status === 'active' ? 'good' : 'bad'} dot>
              {o.status_label}
            </Badge>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Joined {formatDate(o.created_at.slice(0, 10))}</span>
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3.5" /> {o.contact_phone || 'no phone'}
            </span>
            {o.owners[0] && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <UserRound className="size-3.5" /> {o.owners[0].email}
              </span>
            )}
          </span>
        }
        actions={
          !canPlatform('p.businesses.suspend') ? null : o.status === 'active' ? (
            <Button
              variant="outline"
              className="text-destructive hover:border-red-300 hover:bg-red-50"
              onClick={() => setSuspending(true)}
            >
              <Ban /> Suspend
            </Button>
          ) : (
            <Button busy={reactivate.isPending} onClick={() => reactivate.mutate(undefined)}>
              <Power /> Reactivate
            </Button>
          )
        }
      />
      {o.status === 'suspended' && (
        <Alert tone="bad" title="Suspended" className="mb-5">
          {o.suspended_reason || 'No reason recorded.'}
        </Alert>
      )}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Properties"
          value={o.properties_count}
          icon={<Building2 />}
          hint={
            o.awaiting_verification
              ? `${o.awaiting_verification} waiting for verification`
              : 'None waiting for verification'
          }
          tone={o.awaiting_verification ? 'warn' : undefined}
        />
        <Kpi label="Beds" value={o.beds_total} icon={<BedDouble />} />
        <Kpi label="Current tenants" value={o.tenants_count} icon={<UserRound />} />
        <Kpi
          label="Team members"
          value={o.members_count}
          icon={<Users />}
          hint={o.owners.map((u) => u.full_name).join(', ')}
        />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <div className="grid min-w-0 content-start gap-5 xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader
              title="Properties"
              description={rows.length ? `${rows.length} in this business` : undefined}
            />
            {properties.isLoading ? (
              <div className="border-t">
                <TableSkeleton rows={3} />
              </div>
            ) : rows.length === 0 ? (
              <CardContent>
                <InlineEmpty icon={<Building2 />}>No properties yet.</InlineEmpty>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Property</TH>
                    <TH className="hidden sm:table-cell">Status</TH>
                    <TH>Verification</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((p) => (
                    <TR key={p.id}>
                      <TD className="max-w-0 min-w-36 sm:max-w-none">
                        <NameCell
                          lead={<LogoTile src={p.logo_url} icon={<Building2 />} />}
                          name={p.name}
                          to={`/platform/properties/${p.id}`}
                          meta={`${p.property_type_label} · ${p.locality}`}
                        />
                      </TD>
                      <TD className="hidden text-[13px] sm:table-cell">{p.status_label}</TD>
                      <TD>
                        <VerificationBadge p={p} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <PlanCard orgId={o.id} />
          {canPlatform('p.businesses.features') && (
            <FeaturesCard key={o.features.map((f) => `${f.key}${f.enabled}`).join()} org={o} />
          )}
        </div>
        <Card className="xl:sticky xl:top-20">
          <CardHeader title="Recent activity" />
          <CardContent>
            {activity.isLoading ? (
              <TableSkeleton rows={4} avatar={false} />
            ) : (activity.data ?? []).length === 0 ? (
              <InlineEmpty icon={<History />}>Nothing recorded yet.</InlineEmpty>
            ) : (
              <ol>
                {(activity.data ?? []).slice(0, 15).map((a, i, list) => (
                  <TimelineItem
                    key={a.id}
                    last={i === list.length - 1}
                    tone={i === 0 ? 'brand' : 'neutral'}
                    title={actionWords(a.action)}
                    meta={`${a.actor ?? 'System'} · ${relativeTime(a.created_at)}`}
                  />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      {suspending && <SuspendDialog org={o} onOpenChange={setSuspending} />}
    </>
  )
}
