import { KeyRound, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { api } from '../../api/client'
import { useApi, useApiMutation, useList } from '../../api/hooks'
import type { Membership, Property } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import type { Permission } from '../../auth/permissions'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, ErrorAlert, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { ApiError } from '../../api/client'
import type { AccessChoices } from './access'
import { accessSummary, groupByArea, propertiesSummary, tickChanges } from './access'

const QUERIES = ['/members/']

interface Access {
  role: string
  permissions: string[]
  property_ids: string[]
}

/** Role, ticks and properties: the same editor for adding and changing a person. */
function AccessEditor({
  value,
  onChange,
  choices,
  properties,
}: {
  value: Access
  onChange: (next: Access) => void
  choices: AccessChoices
  properties: Property[]
}) {
  const { can, allProperties } = useAuth()
  const role = choices.roles.find((r) => r.value === value.role)
  const isOwner = value.role === 'owner'
  const changes = tickChanges(role?.permissions ?? [], value.permissions)
  const ticked = new Set(value.permissions)
  const limited = value.property_ids.length > 0 || !allProperties

  function toggle(code: string, on: boolean) {
    const next = new Set(ticked)
    if (on) next.add(code)
    else next.delete(code)
    onChange({ ...value, permissions: [...next].sort() })
  }

  function toggleProperty(id: string, on: boolean) {
    const next = new Set(value.property_ids)
    if (on) next.add(id)
    else next.delete(id)
    onChange({ ...value, property_ids: [...next] })
  }

  return (
    <div className="grid gap-5">
      <Field label="Role" hint={role?.help}>
        <NativeSelect
          value={value.role}
          onChange={(e) => {
            const next = choices.roles.find((r) => r.value === e.target.value)
            // A new role starts from that role's ticks.
            onChange({
              ...value,
              role: e.target.value,
              permissions: [...(next?.permissions ?? [])],
            })
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
        <Alert tone="info">An owner can do everything in every property.</Alert>
      ) : (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium">What they can do</p>
              {(changes.added.length > 0 || changes.removed.length > 0) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onChange({ ...value, permissions: [...(role?.permissions ?? [])] })
                  }
                >
                  Same as role
                </Button>
              )}
            </div>
            <div className="grid gap-4">
              {groupByArea(choices.permissions).map((g) => (
                <fieldset key={g.area} className="grid gap-1.5">
                  <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {g.area}
                  </legend>
                  {g.items.map((p) => {
                    const added = changes.added.includes(p.code)
                    const removed = changes.removed.includes(p.code)
                    return (
                      <label key={p.code} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={ticked.has(p.code)}
                          // Nobody can give access they do not have themselves.
                          disabled={!ticked.has(p.code) && !can(p.code as Permission)}
                          onCheckedChange={(v) => toggle(p.code, v === true)}
                        />
                        <span>
                          {p.label}
                          {added && (
                            <Badge tone="good" className="ml-2">
                              Added
                            </Badge>
                          )}
                          {removed && (
                            <Badge tone="warn" className="ml-2">
                              Removed
                            </Badge>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </fieldset>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-[13px] font-medium">Properties they work in</p>
            {allProperties && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!limited}
                  onCheckedChange={(v) =>
                    onChange({
                      ...value,
                      property_ids: v === true ? [] : properties.slice(0, 1).map((p) => p.id),
                    })
                  }
                />
                All properties (also new ones)
              </label>
            )}
            {limited && (
              <div className="grid gap-1.5 pl-1">
                {properties.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      aria-label={`Works in ${p.name}`}
                      checked={value.property_ids.includes(p.id)}
                      onCheckedChange={(v) => toggleProperty(p.id, v === true)}
                    />
                    {p.name}
                  </label>
                ))}
                {value.property_ids.length === 0 && (
                  <p className="text-xs text-destructive">Pick at least one property.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AccessDialog({
  member,
  choices,
  properties,
  onClose,
}: {
  member: Membership
  choices: AccessChoices
  properties: Property[]
  onClose: () => void
}) {
  const [value, setValue] = useState<Access>({
    role: member.role,
    permissions: [...member.permissions],
    property_ids: [...member.property_ids],
  })
  const save = useApiMutation(
    (body: Access) => api.patch<Membership>(`/members/${member.id}/`, body),
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
      title={`Access for ${member.user.full_name}`}
      description={member.user.email}
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
      <AccessEditor value={value} onChange={setValue} choices={choices} properties={properties} />
    </Dialog>
  )
}

function AddPersonDialog({
  choices,
  properties,
  onClose,
}: {
  choices: AccessChoices
  properties: Property[]
  onClose: () => void
}) {
  const { allProperties } = useAuth()
  const staff = choices.roles.find((r) => r.value === 'staff')
  const [person, setPerson] = useState({ email: '', full_name: '', temporary_password: '' })
  const [access, setAccess] = useState<Access>({
    role: 'staff',
    permissions: [...(staff?.permissions ?? [])],
    property_ids: allProperties ? [] : properties.slice(0, 1).map((p) => p.id),
  })
  const save = useApiMutation(
    () => api.post<Membership>('/members/', { ...person, ...access }),
    QUERIES,
    () => {
      toast.success(`${person.full_name} added`)
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
      title="Add a person"
      description="They sign in with their email and the temporary password you give them."
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
      <div className="mb-5 grid gap-3">
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
          hint="Needed only if they don't have an account yet. Share it in person; they can change it later."
          error={fieldError('temporary_password')}
        >
          <Input
            autoComplete="off"
            value={person.temporary_password}
            onChange={(e) => setPerson({ ...person, temporary_password: e.target.value })}
          />
        </Field>
      </div>
      <AccessEditor value={access} onChange={setAccess} choices={choices} properties={properties} />
    </Dialog>
  )
}

export function TeamPage() {
  useBreadcrumbs([{ label: 'Team' }])
  const { can, user } = useAuth()
  const canManage = can('team.manage')
  const members = useList<Membership>('/members/')
  const choices = useApi<AccessChoices>('/members/access-choices/')
  const properties = useList<Property>(canManage ? '/properties/' : null)
  const [editing, setEditing] = useState<Membership | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Membership | null>(null)
  const remove = useApiMutation(
    (id: string) => api.delete(`/members/${id}/`),
    QUERIES,
    () => {
      toast.success('Removed from the team')
      setRemoving(null)
    },
  )
  const names = useMemo(
    () => new Map(properties.rows.map((p) => [p.id, p.name] as const)),
    [properties.rows],
  )
  const ready = choices.data && (!canManage || !properties.isLoading)

  return (
    <>
      <PageHeader
        title="Team"
        description="Choose a role for each person, then tick or untick what they can do and pick the properties they work in."
        actions={
          canManage && (
            <Button onClick={() => setAdding(true)} disabled={!ready}>
              <UserPlus /> Add person
            </Button>
          )
        }
      />
      <ErrorAlert error={members.error ?? choices.error} className="mb-4" />
      {members.isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Person</TH>
                <TH>Role</TH>
                <TH>Access</TH>
                <TH>Properties</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {members.rows.map((m) => {
                const isMe = m.user.id === user?.id
                return (
                  <TR key={m.id}>
                    <TD>
                      <span className="font-medium">{m.user.full_name}</span>
                      {isMe && <span className="text-muted-foreground"> (you)</span>}
                      <span className="block text-xs text-muted-foreground">{m.user.email}</span>
                    </TD>
                    <TD>
                      {m.is_active ? (
                        <Badge tone={m.role === 'owner' ? 'info' : 'neutral'}>{m.role_label}</Badge>
                      ) : (
                        <Badge tone="bad">Removed</Badge>
                      )}
                    </TD>
                    <TD className="text-[13px]">
                      {m.role === 'owner'
                        ? 'Everything'
                        : accessSummary(m.extra_permissions, m.removed_permissions)}
                    </TD>
                    <TD className="text-[13px]">
                      {m.role === 'owner'
                        ? 'All properties'
                        : propertiesSummary(m.property_ids, names)}
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      {canManage && m.is_active && !isMe && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!ready}
                            onClick={() => setEditing(m)}
                          >
                            <KeyRound /> Change access
                          </Button>{' '}
                          <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}>
                            Remove
                          </Button>
                        </>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}
      {editing && choices.data && (
        <AccessDialog
          member={editing}
          choices={choices.data}
          properties={properties.rows}
          onClose={() => setEditing(null)}
        />
      )}
      {adding && choices.data && (
        <AddPersonDialog
          choices={choices.data}
          properties={properties.rows}
          onClose={() => setAdding(false)}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.user.full_name ?? ''}?`}
        confirmLabel="Remove"
        destructive
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => removing && remove.mutate(removing.id)}
      >
        They can no longer open this business. Their past work stays in the records.
      </ConfirmDialog>
    </>
  )
}
