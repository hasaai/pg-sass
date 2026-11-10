import { History, KeyRound, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { api, ApiError } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/AuthContext'
import type { PlatformPermission } from '../../auth/permissions'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, ErrorAlert, PageHeader } from '../../components/ui-kit/feedback'
import { MenuItem } from '../../components/ui-kit/menu'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { relativeTime } from '../../lib/format'
import type { AccessChoices } from '../team/access'
import { accessSummary, groupByArea, tickChanges } from '../team/access'
import { Avatar, InlineEmpty, NameCell, RowMenu, TableSkeleton, TimelineItem } from './parts'

type Staff = components['schemas']['Staff']
type StaffEvent = components['schemas']['StaffEvent']

const QUERIES = ['/platform/staff/']
const EVENT_LABEL: Record<string, string> = {
  'staff.add': 'Added to the team',
  'staff.access': 'Access changed',
  'staff.remove': 'Removed from the team',
}

interface Access {
  role: string
  permissions: string[]
}

function RoleAndTicks({
  value,
  onChange,
  choices,
}: {
  value: Access
  onChange: (next: Access) => void
  choices: AccessChoices
}) {
  const { canPlatform } = useAuth()
  const role = choices.roles.find((r) => r.value === value.role)
  const changes = tickChanges(role?.permissions ?? [], value.permissions)
  const ticked = new Set(value.permissions)
  const isOwner = value.role === 'platform_owner'
  return (
    <div className="grid gap-5">
      <Field label="Role" hint={role?.help}>
        <NativeSelect
          value={value.role}
          onChange={(e) => {
            const next = choices.roles.find((r) => r.value === e.target.value)
            onChange({ role: e.target.value, permissions: [...(next?.permissions ?? [])] })
          }}
        >
          {choices.roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {isOwner ? (
        <Alert tone="info">
          A Platform owner can do everything on the platform and inside every business.
        </Alert>
      ) : (
        <div className="grid gap-4">
          {groupByArea(choices.permissions).map((g) => (
            <fieldset key={g.area} className="grid gap-0.5 rounded-xl border p-1.5">
              <legend className="px-1.5 text-xs font-medium text-muted-foreground">{g.area}</legend>
              {g.items.map((p) => (
                <label
                  key={p.code}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary/60"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={ticked.has(p.code)}
                    disabled={!ticked.has(p.code) && !canPlatform(p.code as PlatformPermission)}
                    onCheckedChange={(v) => {
                      const next = new Set(ticked)
                      if (v === true) next.add(p.code)
                      else next.delete(p.code)
                      onChange({ ...value, permissions: [...next].sort() })
                    }}
                  />
                  <span>
                    {p.label}
                    {changes.added.includes(p.code) && (
                      <Badge tone="good" className="ml-2">
                        Added
                      </Badge>
                    )}
                    {changes.removed.includes(p.code) && (
                      <Badge tone="warn" className="ml-2">
                        Removed
                      </Badge>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </div>
  )
}

function EditDialog({
  staff,
  choices,
  onClose,
}: {
  staff: Staff
  choices: AccessChoices
  onClose: () => void
}) {
  const [value, setValue] = useState<Access>({
    role: staff.role,
    permissions: [...staff.permissions],
  })
  const save = useApiMutation(
    (body: Access) => api.patch<Staff>(`/platform/staff/${staff.id}/`, body),
    QUERIES,
    () => {
      toast.success('Access saved')
      onClose()
    },
  )
  return (
    <Dialog
      open
      variant="side"
      onOpenChange={(o) => !o && onClose()}
      title={`Access for ${staff.user.full_name}`}
      description={staff.user.email}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={() => save.mutate(value)}>
            Save access
          </Button>
        </>
      }
    >
      <ErrorAlert error={save.error} className="mb-4" />
      <RoleAndTicks value={value} onChange={setValue} choices={choices} />
    </Dialog>
  )
}

function AddDialog({ choices, onClose }: { choices: AccessChoices; onClose: () => void }) {
  const support = choices.roles.find((r) => r.value === 'support_agent')
  const [person, setPerson] = useState({ email: '', full_name: '', temporary_password: '' })
  const [access, setAccess] = useState<Access>({
    role: 'support_agent',
    permissions: [...(support?.permissions ?? [])],
  })
  const save = useApiMutation(
    () => api.post<Staff>('/platform/staff/', { ...person, ...access }),
    QUERIES,
    () => {
      toast.success(`${person.full_name} added to the team`)
      onClose()
    },
  )
  const fieldError = (name: string) =>
    save.error instanceof ApiError ? save.error.fieldError(name) : undefined
  return (
    <Dialog
      open
      variant="side"
      onOpenChange={(o) => !o && onClose()}
      title="Add to the PG Manager team"
      description="Use a separate email from any business account."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={() => save.mutate()}>
            Add to team
          </Button>
        </>
      }
    >
      <ErrorAlert
        error={save.error}
        fields={['email', 'full_name', 'temporary_password']}
        className="mb-4"
      />
      <div className="mb-6 grid gap-4 border-b pb-6">
        <Field label="Name" required error={fieldError('full_name')}>
          <Input
            value={person.full_name}
            onChange={(e) => setPerson({ ...person, full_name: e.target.value })}
          />
        </Field>
        <Field label="Email" required error={fieldError('email')}>
          <Input
            type="email"
            value={person.email}
            onChange={(e) => setPerson({ ...person, email: e.target.value })}
          />
        </Field>
        <Field
          label="Temporary password"
          hint="Needed only if they don't have an account yet. Share it in person."
          error={fieldError('temporary_password')}
        >
          <Input
            autoComplete="off"
            value={person.temporary_password}
            onChange={(e) => setPerson({ ...person, temporary_password: e.target.value })}
          />
        </Field>
      </div>
      <RoleAndTicks value={access} onChange={setAccess} choices={choices} />
    </Dialog>
  )
}

export function PlatformStaffPage() {
  useBreadcrumbs([{ label: 'Platform staff' }])
  const { user } = useAuth()
  const staff = useApi<Staff[]>('/platform/staff/')
  const choices = useApi<AccessChoices>('/platform/staff/access-choices/')
  const history = useApi<StaffEvent[]>('/platform/staff/history/')
  const [editing, setEditing] = useState<Staff | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Staff | null>(null)
  const remove = useApiMutation(
    (id: string) => api.delete(`/platform/staff/${id}/`),
    ['/platform/staff/'],
    () => {
      toast.success('Removed from the team')
      setRemoving(null)
    },
  )
  return (
    <>
      <PageHeader
        title="Platform staff"
        description="The PG Manager team. Give each person a role, then tick or untick what they can do."
        actions={
          <Button onClick={() => setAdding(true)} disabled={!choices.data}>
            <UserPlus /> Add person
          </Button>
        }
      />
      <ErrorAlert error={staff.error ?? choices.error} className="mb-5" />
      <div className="grid items-start gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title="Team"
            description={
              staff.data
                ? `${staff.data.length} ${staff.data.length === 1 ? 'person' : 'people'}`
                : undefined
            }
          />
          {staff.isLoading ? (
            <div className="border-t">
              <TableSkeleton rows={3} />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Person</TH>
                  <TH className="hidden sm:table-cell">Role</TH>
                  <TH className="hidden md:table-cell">Access</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {(staff.data ?? []).map((s) => {
                  const isMe = s.user.id === user?.id
                  const access =
                    s.role === 'platform_owner'
                      ? 'Everything'
                      : accessSummary(s.extra_permissions, s.removed_permissions)
                  return (
                    <TR key={s.id}>
                      <TD className="max-w-0 min-w-40 sm:max-w-none">
                        <NameCell
                          lead={<Avatar name={s.user.full_name} />}
                          name={s.user.full_name}
                          extra={
                            isMe && <span className="text-xs text-muted-foreground">(you)</span>
                          }
                          meta={s.user.email}
                        />
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-12 sm:hidden">
                          <Badge tone={s.role === 'platform_owner' ? 'info' : 'neutral'}>
                            {s.role_label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{access}</span>
                        </div>
                      </TD>
                      <TD className="hidden sm:table-cell">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={s.role === 'platform_owner' ? 'info' : 'neutral'}>
                            {s.role_label}
                          </Badge>
                          {!s.is_active && (
                            <Badge tone="bad" dot>
                              Sign-in off
                            </Badge>
                          )}
                        </div>
                        <span className="mt-1 hidden text-xs text-muted-foreground sm:block md:hidden">
                          {access}
                        </span>
                      </TD>
                      <TD className="hidden text-[13px] text-muted-foreground md:table-cell">
                        {access}
                      </TD>
                      <TD className="pl-0 text-right whitespace-nowrap">
                        {!isMe && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!choices.data}
                              onClick={() => setEditing(s)}
                            >
                              <KeyRound /> <span className="hidden sm:inline">Change access</span>
                              <span className="sr-only sm:hidden">Change access</span>
                            </Button>
                            <RowMenu label={`More for ${s.user.full_name}`}>
                              <MenuItem
                                destructive
                                icon={<UserMinus />}
                                onSelect={() => setRemoving(s)}
                              >
                                Remove
                              </MenuItem>
                            </RowMenu>
                          </div>
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent changes" description="Who changed the team, and when." />
          <CardContent>
            {history.isLoading ? (
              <TableSkeleton rows={3} avatar={false} />
            ) : (history.data ?? []).length === 0 ? (
              <InlineEmpty icon={<History />}>No changes yet.</InlineEmpty>
            ) : (
              <ol>
                {(history.data ?? []).map((e, i, list) => (
                  <TimelineItem
                    key={e.id}
                    last={i === list.length - 1}
                    tone={
                      e.action === 'staff.add'
                        ? 'good'
                        : e.action === 'staff.remove'
                          ? 'bad'
                          : 'info'
                    }
                    title={`${EVENT_LABEL[e.action] ?? e.action}: ${e.target ?? 'someone'}`}
                    meta={`by ${e.actor ?? 'system'} · ${relativeTime(e.created_at)}`}
                  />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      {editing && choices.data && (
        <EditDialog staff={editing} choices={choices.data} onClose={() => setEditing(null)} />
      )}
      {adding && choices.data && (
        <AddDialog choices={choices.data} onClose={() => setAdding(false)} />
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.user.full_name ?? ''} from the team?`}
        confirmLabel="Remove"
        destructive
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => removing && remove.mutate(removing.id)}
      >
        They lose access to the platform portal. Their account stays.
      </ConfirmDialog>
    </>
  )
}
