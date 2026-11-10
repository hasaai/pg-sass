import { Ban, LockOpen, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { api } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Card } from '../../components/ui-kit/card'
import { EmptyState, ErrorAlert, PageHeader } from '../../components/ui-kit/feedback'
import { MenuItem } from '../../components/ui-kit/menu'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { plural, relativeTime } from '../../lib/format'
import { Avatar, FilterBar, NameCell, Pager, RowMenu, SearchBox, TableSkeleton } from './parts'
import type { PlatformUser, UserPage } from './types'
import { PLATFORM_QUERIES } from './types'

const PAGE_SIZE = 25

function SignInToggle({ user }: { user: PlatformUser }) {
  const { canPlatform } = useAuth()
  const change = useApiMutation(
    () =>
      api.post<PlatformUser>(
        `/platform/users/${user.id}/${user.is_active ? 'deactivate' : 'reactivate'}/`,
      ),
    PLATFORM_QUERIES,
    (u) => toast.success(`${u.full_name}: ${u.is_active ? 'can sign in' : 'blocked'}`),
  )
  if (!canPlatform('p.users.deactivate')) return null
  return (
    <RowMenu label={`Actions for ${user.full_name}`}>
      <MenuItem
        destructive={user.is_active}
        icon={user.is_active ? <Ban /> : <LockOpen />}
        disabled={change.isPending}
        onSelect={() => change.mutate(undefined, { onError: (e) => toast.error(e.message) })}
      >
        {user.is_active ? 'Block sign-in' : 'Allow sign-in'}
      </MenuItem>
    </RowMenu>
  )
}

export function UsersPage() {
  useBreadcrumbs([{ label: 'Users' }])
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const [search, setSearch] = useState(q)
  const list = useApi<UserPage>('/platform/users/', {
    q: q || undefined,
    page,
    page_size: PAGE_SIZE,
  })
  const rows = list.data?.results ?? []
  const count = list.data?.count ?? 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const go = (next: Record<string, string | null>) => {
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
        title="Users"
        description="Owners, managers, staff and room seekers across PG Manager."
      />
      <Card className="overflow-hidden">
        <FilterBar>
          <SearchBox
            label="Search by name, email or phone"
            value={search}
            onChange={setSearch}
            onSubmit={() => go({ q: search.trim() || null })}
          />
        </FilterBar>
        <ErrorAlert error={list.error} className="m-4" />
        {list.isLoading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState className="m-4 border-0" icon={<Users />} title="No people match">
            {q ? 'Try part of the name, the email or the mobile number.' : null}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH className="hidden md:table-cell">Businesses</TH>
                <TH className="hidden lg:table-cell">Last sign-in</TH>
                <TH>Sign-in</TH>
                <TH className="w-12">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((u) => (
                <TR key={u.id}>
                  <TD className="max-w-0 min-w-40 sm:max-w-none">
                    <NameCell
                      lead={<Avatar name={u.full_name} />}
                      name={u.full_name}
                      extra={u.is_platform_admin && <Badge tone="info">Platform team</Badge>}
                      meta={u.email ?? u.phone}
                    />
                  </TD>
                  <TD className="hidden text-[13px] md:table-cell">
                    {u.memberships.length === 0 ? (
                      <span className="text-muted-foreground">Room seeker</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {u.memberships.map((m) => (
                          <Link
                            key={m.organization_id}
                            to={`/platform/businesses/${m.organization_id}`}
                            className="inline-flex max-w-full items-center gap-1 truncate rounded-md border bg-card px-2 py-0.5 text-xs text-foreground no-underline hover:border-border-strong"
                          >
                            <span className="truncate font-medium">{m.organization_name}</span>
                            <span className="text-muted-foreground">({m.role_label})</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </TD>
                  <TD className="hidden text-[13px] whitespace-nowrap text-muted-foreground lg:table-cell">
                    {u.last_login ? relativeTime(u.last_login) : 'Never'}
                  </TD>
                  <TD>
                    <Badge tone={u.is_active ? 'good' : 'bad'} dot>
                      {u.is_active ? 'Allowed' : 'Blocked'}
                    </Badge>
                  </TD>
                  <TD className="pl-0 text-right">
                    {!u.is_platform_admin && <SignInToggle user={u} />}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {count > 0 && (
          <Pager
            summary={plural(count, 'person', 'people')}
            page={page}
            pages={pages}
            onPage={(n) => go({ page: String(n) })}
          />
        )}
      </Card>
    </>
  )
}
