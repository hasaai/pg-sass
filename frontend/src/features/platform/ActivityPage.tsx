import { History } from 'lucide-react'
import { Link } from 'react-router'

import { useApi } from '../../api/hooks'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Card } from '../../components/ui-kit/card'
import { EmptyState, ErrorAlert, PageHeader } from '../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { relativeTime } from '../../lib/format'
import { Avatar, TableSkeleton } from './parts'
import type { Activity } from './types'
import { actionWords } from './types'

export function ActivityPage() {
  useBreadcrumbs([{ label: 'Activity' }])
  const activity = useApi<Activity[]>('/platform/activity')
  const rows = activity.data ?? []
  return (
    <>
      <PageHeader
        title="Activity"
        description="The latest 100 recorded changes across all businesses."
      />
      <ErrorAlert error={activity.error} className="mb-5" />
      {activity.isLoading ? (
        <Card className="overflow-hidden">
          <TableSkeleton rows={8} />
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState icon={<History />} title="Nothing recorded yet">
          Changes made in any business show up here.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>What</TH>
                <TH className="hidden md:table-cell">Business</TH>
                <TH className="hidden sm:table-cell">Who</TH>
                <TH className="text-right">When</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((a) => (
                <TR key={a.id}>
                  <TD className="max-w-0 min-w-40 sm:max-w-none">
                    <p className="truncate text-[13.5px] font-medium">{actionWords(a.action)}</p>
                    <p className="truncate text-xs text-muted-foreground md:hidden">
                      {a.organization_name}
                      <span className="sm:hidden"> · {a.actor ?? 'System'}</span>
                    </p>
                  </TD>
                  <TD className="hidden text-[13px] md:table-cell">
                    <Link
                      to={`/platform/businesses/${a.organization_id}`}
                      className="text-foreground no-underline hover:underline"
                    >
                      {a.organization_name}
                    </Link>
                  </TD>
                  <TD className="hidden text-[13px] sm:table-cell">
                    <span className="flex items-center gap-2">
                      <Avatar name={a.actor ?? 'System'} size="sm" />
                      <span className="truncate">{a.actor ?? 'System'}</span>
                    </span>
                  </TD>
                  <TD className="text-right text-[13px] whitespace-nowrap">
                    <span className="text-foreground">{relativeTime(a.created_at)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  )
}
