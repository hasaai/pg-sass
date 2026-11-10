import {
  AlertTriangle,
  CircleDashed,
  CircleDot,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserX,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'

import { api } from '../../api/client'
import { useApiMutation, useList } from '../../api/hooks'
import type { Complaint, Membership, Property, Tenant } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { ErrorBanner, SelectField, TextAreaField, TextField } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader, Skeleton, StatCard } from '../../components/ui-kit/feedback'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui-kit/menu'
import { cn } from '../../lib/cn'
import { formatDate, titleCase } from '../../lib/format'
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, PRIORITIES } from '../../lib/options'
import { useForm } from '../../lib/useForm'

/** Someone a complaint can be given to. */
type Assignee = Pick<Membership, 'id' | 'user'>

const INVALIDATE = ['/complaints/', '/reports/']

// "open" asks for open and in progress together (the old "Open" choice gave the same list).
const FILTERS = [
  { value: 'open', label: 'Open and in progress' },
  ...COMPLAINT_STATUSES.filter((s) => s.value !== 'open'),
]

const PRIORITY_TONE = { high: 'bad', medium: 'warn', low: 'neutral' } as const
const STATUS_DOT: Record<string, string> = {
  open: 'bg-amber-500',
  in_progress: 'bg-sky-500',
  resolved: 'bg-emerald-500',
  closed: 'bg-slate-400',
}

const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? titleCase(value)

function ComplaintForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const properties = useList<Property>('/properties/')
  const tenants = useList<Tenant>('/tenants/', { residency: 'current' })
  const form = useForm({
    property: '',
    tenant: '',
    category: 'other',
    title: '',
    description: '',
    priority: 'medium',
  })
  const save = useApiMutation(
    (b: Record<string, unknown>) => api.post('/complaints/', b),
    INVALIDATE,
    onDone,
  )
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(
          { ...form.values, tenant: form.values.tenant || null },
          { onError: form.setError },
        )
      }}
    >
      <ErrorBanner
        error={form.error}
        fields={['property', 'tenant', 'category', 'title', 'priority']}
      />
      <TextField
        label="Title"
        required
        placeholder="e.g. Tap leaking in room 201"
        error={form.fieldError('title')}
        {...form.bind('title')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Property"
          placeholder="Choose"
          options={properties.rows.map((p) => ({ value: p.id, label: p.name }))}
          error={form.fieldError('property')}
          {...form.bind('property')}
        />
        <SelectField
          label="Raised by (optional)"
          placeholder="—"
          options={tenants.rows.map((t) => ({
            value: t.id,
            label: `${t.full_name} · ${t.current_stay?.place.label ?? ''}`,
          }))}
          {...form.bind('tenant')}
        />
        <SelectField label="Category" options={COMPLAINT_CATEGORIES} {...form.bind('category')} />
        <SelectField label="Priority" options={PRIORITIES} {...form.bind('priority')} />
      </div>
      <TextAreaField label="Details" rows={3} {...form.bind('description')} />
      <div className="sticky -bottom-5 -mx-6 -mb-5 mt-1 flex flex-wrap justify-end gap-2 border-t bg-card px-6 py-3.5">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" busy={save.isPending}>
          Log complaint
        </Button>
      </div>
    </form>
  )
}

function ComplaintRow({
  c,
  members,
  canDelete,
}: {
  c: Complaint
  members: Assignee[]
  canDelete: boolean
}) {
  const update = useApiMutation(
    (b: Record<string, unknown>) => api.patch(`/complaints/${c.id}/`, b),
    INVALIDATE,
  )
  const remove = useApiMutation(() => api.delete(`/complaints/${c.id}/`), INVALIDATE)
  const priority = c.priority ?? 'medium'
  const done = c.status === 'resolved' || c.status === 'closed'
  return (
    <li className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-secondary/30 md:flex-row md:items-start md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              'text-[14px] font-medium',
              done && 'text-muted-foreground line-through decoration-border-strong',
            )}
          >
            {c.title}
          </p>
          <Badge tone={PRIORITY_TONE[priority]} dot>
            {labelOf(PRIORITIES, priority)}
          </Badge>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
          <span className="font-medium text-secondary-foreground">
            {labelOf(COMPLAINT_CATEGORIES, c.category)}
          </span>
          <span aria-hidden>·</span>
          <span>{c.property_name}</span>
          {c.tenant_name && (
            <>
              <span aria-hidden>·</span>
              <span>{c.tenant_name}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="tabular-nums">Logged {formatDate(c.created_at)}</span>
        </p>
        {c.description && (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {c.description}
          </p>
        )}
        {done && (
          <Input
            className="mt-2.5 h-8 max-w-md text-[13px]"
            aria-label="What was done"
            placeholder="What was done? e.g. Replaced the tap"
            defaultValue={c.resolution_note ?? ''}
            onBlur={(e) => {
              if (e.target.value !== (c.resolution_note ?? ''))
                update.mutate({ resolution_note: e.target.value })
            }}
          />
        )}
        {(update.error || remove.error) && (
          <p role="alert" className="mt-2 text-xs font-medium text-destructive">
            {(update.error ?? remove.error)?.message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 md:shrink-0">
        <NativeSelect
          aria-label="Assignee"
          value={c.assignee ?? ''}
          onChange={(e) => update.mutate({ assignee: e.target.value || null })}
          className={cn(
            'h-8 min-w-0 flex-1 text-[13px] md:w-56 md:flex-none',
            !c.assignee && 'text-muted-foreground',
          )}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.full_name}
            </option>
          ))}
        </NativeSelect>
        <div className="relative w-[8.75rem] shrink-0">
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-1/2 left-2.5 size-2 -translate-y-1/2 rounded-full',
              STATUS_DOT[c.status ?? 'open'],
            )}
          />
          <NativeSelect
            aria-label="Status"
            value={c.status}
            onChange={(e) => update.mutate({ status: e.target.value })}
            className="h-8 pl-6 text-[13px] font-medium"
          >
            {COMPLAINT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {canDelete && (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More for ${c.title}`}>
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem destructive icon={<Trash2 />} onSelect={() => remove.mutate(undefined)}>
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </div>
    </li>
  )
}

function ListSkeleton() {
  return (
    <Card role="status" aria-label="Loading" className="divide-y">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-6 px-5 py-4">
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="hidden h-8 w-56 md:block" />
          <Skeleton className="hidden h-8 w-[8.75rem] md:block" />
        </div>
      ))}
    </Card>
  )
}

export function ComplaintsPage() {
  const { can, user } = useAuth()
  const seesTeam = can('team.view')
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const query = filter === 'open' ? { open: true } : { status: filter }
  const { rows, isLoading, error } = useList<Complaint>('/complaints/', query)
  const members = useList<Membership>(seesTeam ? '/members/' : null)
  // Without the team list, people can still assign complaints to themselves.
  const assignees: Assignee[] = seesTeam
    ? members.rows.filter((m) => m.is_active)
    : user
      ? [{ id: 'me', user: { id: user.id, email: user.email ?? '', full_name: user.full_name } }]
      : []
  const term = search.trim().toLowerCase()
  const shown = term
    ? rows.filter((c) =>
        [c.title, c.description, c.property_name, c.tenant_name, c.category]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : rows
  const count = (status: string) => rows.filter((c) => c.status === status).length

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Repairs and problems raised in your PGs. Give each one to someone and track it to done."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Log complaint
          </Button>
        }
      />
      <div className="grid gap-5">
        {filter === 'open' && !isLoading && rows.length > 0 && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Not started" value={count('open')} icon={<CircleDashed />} />
            <StatCard label="In progress" value={count('in_progress')} icon={<CircleDot />} />
            <StatCard
              label="High priority"
              value={rows.filter((c) => c.priority === 'high').length}
              icon={<AlertTriangle />}
            />
            <StatCard
              label="Not assigned"
              value={rows.filter((c) => !c.assignee).length}
              icon={<UserX />}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search complaints"
              placeholder="Search title, PG or tenant"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&_button]:whitespace-nowrap">
            <Segmented label="Show" value={filter} onChange={setFilter} options={FILTERS} />
          </div>
        </div>

        <ErrorBanner error={error} />
        {isLoading ? (
          <ListSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Wrench />}
            title={term ? 'No complaints match your search.' : 'No complaints here.'}
            actions={
              !term && (
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <Plus /> Log complaint
                </Button>
              )
            }
          >
            {term
              ? 'Try another word, or clear the search.'
              : filter === 'open'
                ? 'Nothing is waiting to be fixed right now.'
                : 'Choose another status above to see other complaints.'}
          </EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-secondary/40 px-5 py-2.5 text-xs font-medium text-muted-foreground">
              <span>
                {shown.length} {shown.length === 1 ? 'complaint' : 'complaints'}
              </span>
              <span className="hidden md:flex md:gap-2">
                <span className="w-56">Assignee</span>
                <span className="w-[8.75rem]">Status</span>
                {can('complaints.delete') && <span className="w-8" />}
              </span>
            </div>
            <ul className="divide-y">
              {shown.map((c) => (
                <ComplaintRow
                  key={c.id}
                  c={c}
                  members={assignees}
                  canDelete={can('complaints.delete')}
                />
              ))}
            </ul>
          </Card>
        )}
      </div>
      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="Log complaint"
        description="Note what is wrong and where. You can give it to someone from the list."
      >
        <ComplaintForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      </Dialog>
    </>
  )
}
