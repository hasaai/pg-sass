import { MoreHorizontal, Send, Trash2, UserCog, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { Avatar, Section } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { ChoiceCards } from '../../components/ui-kit/choice-cards'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input } from '../../components/ui-kit/input'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui-kit/menu'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { newId, updateDb, useDb } from '../../data/store'
import type { PlatformStaffMember } from '../../data/types'
import { useBreadcrumbs } from '../../shell/crumbs'
import { PERSON, STAFF_ROLES, formatDateTime } from './util'

type RoleCode = PlatformStaffMember['role']
const ROLE_CODES = Object.keys(STAFF_ROLES) as RoleCode[]

export function Team() {
  useBreadcrumbs([{ label: 'Platform team' }])
  const staff = useDb((db) => db.platformStaff)
  const [inviting, setInviting] = useState(false)
  const [changing, setChanging] = useState<PlatformStaffMember | null>(null)
  const [removing, setRemoving] = useState<PlatformStaffMember | null>(null)
  const owners = staff.filter((s) => s.role === 'platform_owner')

  function isLastOwner(s: PlatformStaffMember) {
    return s.role === 'platform_owner' && owners.length <= 1
  }

  return (
    <>
      <PageHeader
        title="Platform team"
        description="People at PG Manager who can open this admin area. Nobody here can work inside a business."
        actions={
          <Button onClick={() => setInviting(true)}>
            <UserPlus /> Invite
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Section
          title="Team members"
          description={`${staff.length} people`}
          className="xl:col-span-2"
          bodyClassName="p-0"
        >
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Last active</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {staff.map((s) => {
                const you = s.name === PERSON
                return (
                  <TR key={s.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={s.name} size="sm" hue={(Number(s.id.slice(2)) * 71) % 360} />
                        <div className="min-w-0">
                          <p className="font-medium whitespace-nowrap">
                            {s.name} {you && <span className="text-muted-foreground">(you)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{s.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={s.role === 'platform_owner' ? 'info' : 'outline'}>
                          {STAFF_ROLES[s.role].label}
                        </Badge>
                        {s.status === 'invited' && <Badge tone="warn">Invited</Badge>}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {s.lastActive ? formatDateTime(s.lastActive) : 'Not signed in yet'}
                    </TD>
                    <TD className="text-right">
                      {!you && (
                        <Menu>
                          <MenuTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Actions for ${s.name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem
                              icon={<UserCog />}
                              disabled={isLastOwner(s)}
                              onSelect={() => setChanging(s)}
                            >
                              Change role
                            </MenuItem>
                            {s.status === 'invited' && (
                              <MenuItem
                                icon={<Send />}
                                onSelect={() =>
                                  toast.success(`Invitation sent again to ${s.email}`)
                                }
                              >
                                Send invitation again
                              </MenuItem>
                            )}
                            <MenuSeparator />
                            <MenuItem
                              destructive
                              icon={<Trash2 />}
                              disabled={isLastOwner(s)}
                              onSelect={() => setRemoving(s)}
                            >
                              Remove from team
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            You can’t change your own role. There must always be at least one Platform owner.
          </p>
        </Section>

        <Section title="Roles" description="What each role can do">
          <ul className="grid gap-4">
            {ROLE_CODES.map((r) => (
              <li key={r}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{STAFF_ROLES[r].label}</p>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {staff.filter((s) => s.role === r).length}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {STAFF_ROLES[r].description}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      <RoleDialog
        key={changing?.id}
        member={changing}
        onClose={() => setChanging(null)}
        lastOwner={changing ? isLastOwner(changing) : false}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (!removing) return
          if (isLastOwner(removing)) {
            toast.error('You can’t remove the last Platform owner.')
            return
          }
          updateDb((db) => {
            db.platformStaff = db.platformStaff.filter((s) => s.id !== removing.id)
          })
          toast.success(`${removing.name} removed from the platform team`)
          setRemoving(null)
        }}
      >
        <p>
          They will be signed out at once and can no longer open the admin area. Their past actions
          stay in the log.
        </p>
      </ConfirmDialog>
    </>
  )
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const staff = useDb((db) => db.platformStaff)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<RoleCode | ''>('support_agent')
  const [tried, setTried] = useState(false)
  const errors = {
    name: !name.trim() ? 'Type their name.' : undefined,
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
      ? 'Type a work email like name@pgmanager.in.'
      : staff.some((s) => s.email.toLowerCase() === email.trim().toLowerCase())
        ? 'This person is already in the team.'
        : undefined,
    role: !role ? 'Pick a role.' : undefined,
  }
  function close() {
    setName('')
    setEmail('')
    setRole('support_agent')
    setTried(false)
    onClose()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      variant="side"
      title="Invite to the platform team"
      description="They get an email to set a password and sign in."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true)
              if (errors.name || errors.email || errors.role || !role) return
              updateDb((db) => {
                db.platformStaff = [
                  ...db.platformStaff,
                  {
                    id: newId('ps'),
                    name: name.trim(),
                    email: email.trim(),
                    role,
                    status: 'invited',
                    lastActive: '',
                  },
                ]
              })
              toast.success(`Invitation sent to ${email.trim()}`)
              close()
            }}
          >
            <Send /> Send invitation
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name" required error={tried ? errors.name : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Work email" required error={tried ? errors.email : undefined}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@pgmanager.in"
          />
        </Field>
        <Field label="Role" required error={tried ? errors.role : undefined}>
          <ChoiceCards<RoleCode>
            label="Role"
            columns={2}
            value={role}
            onChange={setRole}
            choices={ROLE_CODES.map((r) => ({
              value: r,
              label: STAFF_ROLES[r].label,
              description: STAFF_ROLES[r].description,
            }))}
          />
        </Field>
      </div>
    </Dialog>
  )
}

function RoleDialog({
  member,
  onClose,
  lastOwner,
}: {
  member: PlatformStaffMember | null
  onClose: () => void
  lastOwner: boolean
}) {
  const [role, setRole] = useState<RoleCode | ''>(member?.role ?? '')
  return (
    <Dialog
      open={Boolean(member)}
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={`Change role for ${member?.name ?? ''}`}
      description="The change applies the next time they open a page."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!member || role === member.role || (lastOwner && role !== 'platform_owner')}
            onClick={() => {
              if (!member || !role) return
              updateDb((db) => {
                db.platformStaff = db.platformStaff.map((s) =>
                  s.id === member.id ? { ...s, role } : s,
                )
              })
              toast.success(`${member.name} is now ${STAFF_ROLES[role].label}`)
              onClose()
            }}
          >
            Save role
          </Button>
        </>
      }
    >
      <ChoiceCards<RoleCode>
        label="Role"
        columns={2}
        value={role}
        onChange={setRole}
        choices={ROLE_CODES.map((r) => ({
          value: r,
          label: STAFF_ROLES[r].label,
          description: STAFF_ROLES[r].description,
        }))}
      />
      {lastOwner && (
        <p className="mt-3 text-xs font-medium text-destructive">
          This is the only Platform owner. Make someone else a Platform owner first.
        </p>
      )}
    </Dialog>
  )
}
