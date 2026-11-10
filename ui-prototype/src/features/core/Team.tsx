/** Team & access: who can sign in to the business and what each person may do. */
import { ArrowLeft, Lock, Mail, Phone, Send, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { Avatar, FilterChips, NoAccess, SearchBox, Section, Toolbar } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Checkbox, CheckboxRow } from '../../components/ui-kit/checkbox'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input } from '../../components/ui-kit/input'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { PERMISSIONS, ROLE_INFO, ROLE_PERMS } from '../../data/seed'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Member, Role } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { useBreadcrumbs } from '../../shell/crumbs'
import { KindIcon } from './parts'
import { ago, memberPermsStore, permsOf } from './util'

const ROLE_TONE: Record<Role, 'info' | 'good' | 'warn' | 'neutral'> = {
  owner: 'info',
  manager: 'good',
  accountant: 'warn',
  caretaker: 'neutral',
}
const STATUS = {
  active: { label: 'Active', tone: 'good' },
  invited: { label: 'Invite sent', tone: 'info' },
  switched_off: { label: 'Access off', tone: 'neutral' },
} as const
const ROLES: Exclude<Role, 'owner'>[] = ['manager', 'accountant', 'caretaker']

function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={ROLE_TONE[role]}>{ROLE_INFO[role].label}</Badge>
}

function usePropertyNames() {
  const properties = useDb((db) => db.properties)
  return (ids: string[]) =>
    ids.length === 0
      ? 'All properties'
      : ids
          .map((id) => properties.find((p) => p.id === id)?.name ?? '')
          .filter(Boolean)
          .join(', ')
}

/* ------------------------------------------------------------------ shared access editor */

function AccessEditor({
  role,
  onRole,
  propertyIds,
  onProperties,
  perms,
  onPerms,
}: {
  role: Exclude<Role, 'owner'>
  onRole: (r: Exclude<Role, 'owner'>) => void
  propertyIds: string[]
  onProperties: (ids: string[]) => void
  perms: string[]
  onPerms: (p: string[]) => void
}) {
  const properties = useDb((db) => db.properties)
  const allProps = propertyIds.length === 0
  const defaults = new Set(ROLE_PERMS[role] ?? [])
  const added = perms.filter((p) => !defaults.has(p)).length
  const removed = [...defaults].filter((p) => !perms.includes(p)).length

  return (
    <div className="grid gap-6">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">Role</legend>
        <div className="grid gap-2">
          {ROLES.map((r) => (
            <label
              key={r}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                role === r
                  ? 'border-primary bg-accent ring-1 ring-primary'
                  : 'hover:bg-secondary/60',
              )}
            >
              <input
                type="radio"
                name="role"
                className="mt-1 accent-[var(--color-primary)]"
                checked={role === r}
                onChange={() => {
                  onRole(r)
                  onPerms(ROLE_PERMS[r] ?? [])
                }}
              />
              <span>
                <span className="block text-sm font-semibold">{ROLE_INFO[r].label}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {ROLE_INFO[r].description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">Properties</legend>
        <div className="grid gap-2">
          <CheckboxRow
            label="All properties"
            hint="Including ones you add later"
            checked={allProps}
            onCheckedChange={(v) => onProperties(v === true ? [] : [properties[0]!.id])}
          />
          {!allProps && (
            <div className="ml-6 grid gap-2">
              {properties
                .filter((p) => p.status !== 'archived')
                .map((p) => (
                  <CheckboxRow
                    key={p.id}
                    label={p.name}
                    hint={p.locality}
                    checked={propertyIds.includes(p.id)}
                    onCheckedChange={(v) => {
                      const next =
                        v === true ? [...propertyIds, p.id] : propertyIds.filter((x) => x !== p.id)
                      if (next.length === 0) {
                        toast.error('Pick at least one property, or tick “All properties”')
                        return
                      }
                      onProperties(next)
                    }}
                  />
                ))}
            </div>
          )}
        </div>
      </fieldset>

      <fieldset>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <legend className="text-[13px] font-medium">What they can do</legend>
          <span className="text-xs text-muted-foreground">
            {added || removed
              ? `${added} added, ${removed} removed from ${ROLE_INFO[role].label}`
              : `Same as ${ROLE_INFO[role].label}`}
            {(added > 0 || removed > 0) && (
              <button
                type="button"
                className="ml-2 font-medium text-primary hover:underline"
                onClick={() => onPerms(ROLE_PERMS[role] ?? [])}
              >
                Reset
              </button>
            )}
          </span>
        </div>
        <div className="grid gap-4">
          {PERMISSIONS.map((g) => (
            <div key={g.group} className="rounded-lg border">
              <p className="border-b bg-secondary/50 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {g.group}
              </p>
              <div className="grid gap-2 p-3">
                {g.items.map(([code, label]) => {
                  const on = perms.includes(code)
                  const changed = on !== defaults.has(code)
                  const ownerOnly = code === 'plan.billing' || code === 'team.manage'
                  return (
                    <label
                      key={code}
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 text-sm',
                        ownerOnly && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={on}
                        disabled={ownerOnly}
                        onCheckedChange={(v) =>
                          onPerms(v === true ? [...perms, code] : perms.filter((p) => p !== code))
                        }
                      />
                      <span className="flex-1">
                        {label}
                        {ownerOnly && (
                          <span className="block text-xs text-muted-foreground">Owner only</span>
                        )}
                      </span>
                      {changed && (
                        <Badge tone={on ? 'good' : 'warn'}>{on ? 'Added' : 'Removed'}</Badge>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {role === 'caretaker' &&
          (perms.includes('rent.view') || perms.includes('expenses.view')) && (
            <Alert tone="warn" className="mt-3">
              This caretaker will be able to see money. Caretakers usually don’t.
            </Alert>
          )}
      </fieldset>
    </div>
  )
}

/* ------------------------------------------------------------------ invite dialog */

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { person } = useSession()
  const navigate = useNavigate()
  const members = useDb((db) => db.members)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('manager')
  const [propertyIds, setPropertyIds] = useState<string[]>([])
  const [perms, setPerms] = useState<string[]>(ROLE_PERMS.manager ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() {
    setName('')
    setPhone('')
    setEmail('')
    setRole('manager')
    setPropertyIds([])
    setPerms(ROLE_PERMS.manager ?? [])
    setErrors({})
  }

  function submit() {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Enter their name'
    const digits = phone.replace(/\D/g, '')
    if (!/^[6-9]\d{9}$/.test(digits)) e.phone = 'Enter a 10-digit mobile number, like 98450 12345'
    else if (members.some((m) => m.phone.replace(/\D/g, '') === digits))
      e.phone = 'This number is already in your team'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
      e.email = 'Enter an email like name@example.com, or leave it empty'
    setErrors(e)
    if (Object.keys(e).length) return
    const id = newId('m')
    updateDb((db) => {
      db.members.push({
        id,
        name: name.trim(),
        phone: `${digits.slice(0, 5)} ${digits.slice(5)}`,
        email: email.trim(),
        role,
        propertyIds,
        status: 'invited',
        lastActive: '',
      })
      logActivity(db, {
        by: person.name,
        kind: 'team',
        action: `Invited ${name.trim()} as ${ROLE_INFO[role].label}`,
        target: propertyIds.length ? `${propertyIds.length} properties` : 'All properties',
      })
    })
    memberPermsStore.set((m) => ({ ...m, [id]: perms }))
    toast.success(`Invite sent to ${name.trim()}`, {
      description: 'They get an SMS with a link to sign in.',
      action: { label: 'Open', onClick: () => navigate(`/app/team/${id}`) },
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
      variant="side"
      title="Invite a person"
      description="They sign in with their own mobile number. You can change or switch off access any time."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <Send /> Send invite
          </Button>
        </>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-4">
          <Field label="Name" required error={errors.name}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ravi Kumar"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile number" required error={errors.phone}>
              <Input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98450 12345"
              />
            </Field>
            <Field label="Email" error={errors.email} hint="Optional">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
        </div>
        <AccessEditor
          role={role}
          onRole={setRole}
          propertyIds={propertyIds}
          onProperties={setPropertyIds}
          perms={perms}
          onPerms={setPerms}
        />
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ list */

export function TeamPage() {
  useBreadcrumbs([{ label: 'Team & access' }])
  const navigate = useNavigate()
  const { can } = useSession()
  const members = useDb((db) => db.members)
  const names = usePropertyNames()
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all' | Role>('all')
  const [inviteOpen, setInviteOpen] = useState(false)

  if (!can('team.view')) return <NoAccess what="the team" />

  const rows = members.filter(
    (m) =>
      (role === 'all' || m.role === role) &&
      (!q || `${m.name} ${m.phone} ${m.email}`.toLowerCase().includes(q.toLowerCase())),
  )
  const count = (r: Role) => members.filter((m) => m.role === r).length

  return (
    <div>
      <PageHeader
        title="Team & access"
        description="Everyone who can sign in to your business, and what they can see."
        actions={
          can('team.manage') && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite person
            </Button>
          )
        }
      />
      <Toolbar>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search by name, phone or email"
          className="max-w-sm"
        />
        <FilterChips
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: 'all', label: 'Everyone', count: members.length },
            { value: 'owner', label: 'Owner', count: count('owner') },
            { value: 'manager', label: 'Managers', count: count('manager') },
            { value: 'accountant', label: 'Accountants', count: count('accountant') },
            { value: 'caretaker', label: 'Caretakers', count: count('caretaker') },
          ]}
        />
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No one matches"
          actions={
            <Button
              variant="outline"
              onClick={() => {
                setQ('')
                setRole('all')
              }}
            >
              Clear filters
            </Button>
          }
        >
          Try another name or role.
        </EmptyState>
      ) : (
        <>
          <div className="hidden rounded-xl border bg-card shadow-xs md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Person</TH>
                  <TH>Role</TH>
                  <TH>Properties</TH>
                  <TH>Status</TH>
                  <TH>Last active</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((m) => (
                  <TR
                    key={m.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/team/${m.id}`)}
                  >
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} hue={(m.name.charCodeAt(0) * 37) % 360} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium">
                            {m.name}
                            {m.role === 'owner' && (
                              <Lock className="size-3 text-muted-foreground" aria-label="Locked" />
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.phone}
                            {m.email && ` · ${m.email}`}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <RoleBadge role={m.role} />
                    </TD>
                    <TD className="max-w-56 truncate text-[13px]">{names(m.propertyIds)}</TD>
                    <TD>
                      <Badge tone={STATUS[m.status].tone} dot>
                        {STATUS[m.status].label}
                      </Badge>
                    </TD>
                    <TD className="text-[13px] text-muted-foreground">
                      {m.lastActive ? ago(m.lastActive) : 'Not yet'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <ul className="grid gap-2 md:hidden">
            {rows.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/app/team/${m.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-xs"
                >
                  <Avatar name={m.name} hue={(m.name.charCodeAt(0) * 37) % 360} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium">{m.name}</p>
                      <RoleBadge role={m.role} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{names(m.propertyIds)}</p>
                    <p className="text-xs text-muted-foreground">
                      {STATUS[m.status].label} ·{' '}
                      {m.lastActive ? ago(m.lastActive) : 'not signed in yet'}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {members.length} people · Your plan allows 10.
      </p>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}

/* ------------------------------------------------------------------ detail */

export function TeamMemberPage() {
  const { id } = useParams()
  const members = useDb((db) => db.members)
  const member = members.find((m) => m.id === id)
  useBreadcrumbs([
    { label: 'Team & access', to: '/app/team' },
    { label: member?.name ?? 'Not found' },
  ])
  const navigate = useNavigate()
  const { can } = useSession()

  if (!can('team.view')) return <NoAccess what="the team" />
  if (!member)
    return (
      <EmptyState
        icon={<Users />}
        title="This person is not in your team"
        actions={<Button onClick={() => navigate('/app/team')}>Back to team</Button>}
      >
        They may have been removed.
      </EmptyState>
    )
  return <MemberDetail key={member.id} member={member} />
}

function MemberDetail({ member }: { member: Member }) {
  const navigate = useNavigate()
  const { can, person } = useSession()
  const activity = useDb((db) => db.activity)
  const names = usePropertyNames()
  const locked = member.role === 'owner'
  const editable = can('team.manage') && !locked
  const [role, setRole] = useState<Exclude<Role, 'owner'>>(
    member.role === 'owner' ? 'manager' : member.role,
  )
  const [propertyIds, setPropertyIds] = useState(member.propertyIds)
  const [perms, setPerms] = useState(() => permsOf(member.id, member.role))
  const [confirm, setConfirm] = useState<'off' | 'remove' | null>(null)

  const theirs = useMemo(
    () => activity.filter((a) => a.by === member.name).slice(0, 8),
    [activity, member.name],
  )

  function save() {
    updateDb((db) => {
      const m = db.members.find((x) => x.id === member.id)
      if (!m) return
      m.role = role
      m.propertyIds = propertyIds
      logActivity(db, {
        by: person.name,
        kind: 'team',
        action: `Changed access for ${member.name} (${ROLE_INFO[role].label})`,
        target: names(propertyIds),
      })
    })
    memberPermsStore.set((m) => ({ ...m, [member.id]: perms }))
    toast.success(`Access saved for ${member.name}`, {
      description: 'It applies the next time they open the app.',
    })
  }

  function switchAccess() {
    const off = member.status !== 'switched_off'
    updateDb((db) => {
      const m = db.members.find((x) => x.id === member.id)
      if (m) m.status = off ? 'switched_off' : 'active'
      logActivity(db, {
        by: person.name,
        kind: 'team',
        action: off
          ? `Switched off access for ${member.name}`
          : `Switched access back on for ${member.name}`,
        target: 'Team',
      })
    })
    setConfirm(null)
    toast.success(off ? `${member.name} can no longer sign in` : `${member.name} can sign in again`)
  }

  function remove() {
    updateDb((db) => {
      db.members = db.members.filter((x) => x.id !== member.id)
      logActivity(db, {
        by: person.name,
        kind: 'team',
        action: `Removed ${member.name} from the team`,
        target: 'Team',
      })
    })
    setConfirm(null)
    toast.success(`${member.name} removed from the team`)
    navigate('/app/team')
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2"
        onClick={() => navigate('/app/team')}
      >
        <ArrowLeft /> Team
      </Button>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={member.name} hue={(member.name.charCodeAt(0) * 37) % 360} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{member.name}</h1>
            <RoleBadge role={member.role} />
            <Badge tone={STATUS[member.status].tone} dot>
              {STATUS[member.status].label}
            </Badge>
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <a
              href={`tel:${member.phone.replace(/\s/g, '')}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Phone className="size-3.5" /> {member.phone}
            </a>
            {member.email && (
              <a
                href={`mailto:${member.email}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Mail className="size-3.5" /> {member.email}
              </a>
            )}
          </p>
        </div>
        {member.status === 'invited' && editable && (
          <Button
            variant="outline"
            onClick={() => toast.success(`Invite sent again to ${member.phone}`)}
          >
            <Send /> Send invite again
          </Button>
        )}
      </div>

      {locked && (
        <Alert tone="info" className="mb-5" title="The owner can do everything">
          The owner’s access can’t be changed or switched off. To hand over the business, contact
          support.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Section
          title="Access"
          description={
            locked
              ? 'Everything, on all properties.'
              : `${ROLE_INFO[role].label} · ${names(propertyIds)}`
          }
        >
          {locked ? (
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {PERMISSIONS.flatMap((g) => g.items as readonly (readonly [string, string])[]).map(
                ([code, label]) => (
                  <li key={code} className="flex items-center gap-2 text-muted-foreground">
                    <Lock className="size-3.5" /> {label}
                  </li>
                ),
              )}
            </ul>
          ) : (
            <div className={cn(!editable && 'pointer-events-none opacity-70')}>
              <AccessEditor
                role={role}
                onRole={setRole}
                propertyIds={propertyIds}
                onProperties={setPropertyIds}
                perms={perms}
                onPerms={setPerms}
              />
            </div>
          )}
          {editable && (
            <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setConfirm('off')}>
                  {member.status === 'switched_off' ? 'Switch access on' : 'Switch off access'}
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-red-50"
                  onClick={() => setConfirm('remove')}
                >
                  Remove from team
                </Button>
              </div>
              <Button onClick={save}>Save</Button>
            </div>
          )}
        </Section>

        <Section title="Recent activity" bodyClassName="p-0">
          {theirs.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              {member.status === 'invited'
                ? 'They haven’t signed in yet.'
                : 'Nothing recorded yet.'}
            </p>
          ) : (
            <ul className="divide-y">
              {theirs.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-3">
                  <KindIcon kind={a.kind} />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-snug">{a.action}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.target} · {ago(a.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <ConfirmDialog
        open={confirm === 'off'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          member.status === 'switched_off'
            ? `Let ${member.name} sign in again?`
            : `Switch off access for ${member.name}?`
        }
        confirmLabel={member.status === 'switched_off' ? 'Switch on' : 'Switch off'}
        destructive={member.status !== 'switched_off'}
        onConfirm={switchAccess}
      >
        {member.status === 'switched_off'
          ? 'They can sign in again with the same access as before.'
          : 'They are signed out right away and can’t sign in. Their past work stays in the activity log. You can switch it back on later.'}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'remove'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Remove ${member.name}?`}
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
      >
        They lose access and disappear from this list. Their past work stays in the activity log. To
        work with them again you need to invite them again.
      </ConfirmDialog>
    </div>
  )
}
