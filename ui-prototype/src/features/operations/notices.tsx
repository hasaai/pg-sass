/** Notices: post updates to tenants and staff by app, WhatsApp and SMS. */
import {
  CalendarClock,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Smartphone,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  FilterChips,
  NoAccess,
  PropertyPicker,
  SearchBox,
  Switch,
  Toolbar,
} from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Checkbox, CheckboxRow } from '../../components/ui-kit/checkbox'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, Meter, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, Textarea } from '../../components/ui-kit/input'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui-kit/menu'
import { toast } from '../../components/ui-kit/toast'
import { Tooltip } from '../../components/ui-kit/tooltip'
import { TODAY } from '../../data/seed'
import { newId, updateDb, useDb } from '../../data/store'
import type { Db } from '../../data/store'
import type { Notice } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { updateExtras, useExtras } from './extras'
import { addDays } from './helpers'

type Audience = Notice['audience']
type Channel = Notice['channel'][number]

const AUDIENCE: Record<Audience, { label: string; tone: 'info' | 'warn' | 'good' }> = {
  tenants: { label: 'Tenants', tone: 'info' },
  staff: { label: 'Staff', tone: 'warn' },
  all: { label: 'Everyone', tone: 'good' },
}

const CHANNEL: Record<Channel, { label: string; icon: LucideIcon }> = {
  app: { label: 'In the app', icon: Smartphone },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  sms: { label: 'SMS', icon: MessageSquare },
}

const SMS_COST = 25 // paise per SMS

const TEMPLATES: { key: string; label: string; title: string; body: string }[] = [
  {
    key: 'water',
    label: 'Water cut',
    title: 'Water supply off on Saturday 10 am – 2 pm',
    body: 'BWSSB is repairing the main line. Please store water on Friday night. Sorry for the trouble.',
  },
  {
    key: 'rent',
    label: 'Rent due',
    title: 'December rent is due on the 5th',
    body: 'Please pay by UPI to ashastays@okhdfc or at the office. A late fee applies after the 7th.',
  },
  {
    key: 'pest',
    label: 'Pest control',
    title: 'Pest control on Sunday',
    body: 'Pest control in all rooms between 11 am and 4 pm. Please keep food items closed and leave cupboards open.',
  },
  {
    key: 'festival',
    label: 'Festival',
    title: 'Festival dinner this Friday',
    body: 'Special dinner on the terrace at 8 pm with sweets. Everyone is welcome!',
  },
]

/** How many people a notice goes to. */
function recipients(db: Db, propertyIds: string[], audience: Audience) {
  const tenants = db.tenants.filter(
    (t) => propertyIds.includes(t.propertyId) && (t.status === 'active' || t.status === 'notice'),
  ).length
  const staff = db.staff.filter(
    (s) => s.status !== 'left' && s.propertyIds.some((p) => propertyIds.includes(p)),
  ).length
  return audience === 'tenants' ? tenants : audience === 'staff' ? staff : tenants + staff
}

export function NoticesPage() {
  useBreadcrumbs([{ label: 'Notices' }])
  const { can } = useSession()
  const db = useDb((d) => d)
  const schedule = useExtras((x) => x.noticeSchedule)
  const [query, setQuery] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [audience, setAudience] = useState<'any' | Audience>('any')
  const [editing, setEditing] = useState<Notice | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Notice | null>(null)

  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    return db.notices
      .filter((n) => !propertyId || n.propertyIds.includes(propertyId))
      .filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.postedOn.localeCompare(a.postedOn))
  }, [db.notices, propertyId, query])
  const rows = base.filter((n) => audience === 'any' || n.audience === audience)

  if (!can('notices.manage')) return <NoAccess what="notices" />

  function togglePin(n: Notice) {
    updateDb((d) => {
      const x = d.notices.find((y) => y.id === n.id)
      if (x) x.pinned = !x.pinned
    })
    toast.success(n.pinned ? 'Notice unpinned' : 'Notice pinned to the top')
  }

  return (
    <>
      <PageHeader
        title="Notices"
        description="Tell tenants and staff about water cuts, rent dates, events and rules."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Post notice
          </Button>
        }
      />

      <Toolbar>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search notices"
          className="max-w-sm"
        />
        <PropertyPicker value={propertyId} onChange={setPropertyId} />
      </Toolbar>
      <div className="mb-5">
        <FilterChips
          label="Who it is for"
          value={audience}
          onChange={setAudience}
          options={[
            { value: 'any', label: 'All notices', count: base.length },
            ...(Object.keys(AUDIENCE) as Audience[]).map((a) => ({
              value: a,
              label: AUDIENCE[a].label,
              count: base.filter((n) => n.audience === a).length,
            })),
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="No notices match"
          actions={
            <Button variant="outline" onClick={() => setEditing('new')}>
              <Plus /> Post notice
            </Button>
          }
        >
          Change the filters, or post a new notice.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((n) => {
            const total = Math.max(n.readBy, recipients(db, n.propertyIds, n.audience))
            const scheduled = schedule[n.id]
            return (
              <article
                key={n.id}
                className={cn(
                  'flex flex-col rounded-xl border bg-card p-5 shadow-xs',
                  n.pinned && 'border-primary/40 ring-1 ring-primary/20',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {n.pinned && (
                        <Badge tone="info">
                          <Pin /> Pinned
                        </Badge>
                      )}
                      {scheduled && (
                        <Badge tone="warn">
                          <CalendarClock /> Goes out {formatDate(scheduled)}
                        </Badge>
                      )}
                      <Badge tone={AUDIENCE[n.audience].tone}>{AUDIENCE[n.audience].label}</Badge>
                    </div>
                    <h2 className="text-[15px] leading-snug font-semibold">{n.title}</h2>
                  </div>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`More for ${n.title}`}>
                        <MoreHorizontal />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem icon={<Pencil />} onSelect={() => setEditing(n)}>
                        Edit
                      </MenuItem>
                      <MenuItem
                        icon={n.pinned ? <PinOff /> : <Pin />}
                        onSelect={() => togglePin(n)}
                      >
                        {n.pinned ? 'Unpin' : 'Pin to top'}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem destructive icon={<Trash2 />} onSelect={() => setDeleting(n)}>
                        Delete
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {n.body}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {n.propertyIds.map((pid) => (
                    <Badge key={pid} tone="outline">
                      {db.properties.find((p) => p.id === pid)?.name ?? '—'}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 border-t pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {n.postedBy} · {formatDate(n.postedOn)}
                    </span>
                    <span className="flex items-center gap-1">
                      {n.channel.map((ch) => {
                        const Icon = CHANNEL[ch].icon
                        return (
                          <Tooltip key={ch} content={CHANNEL[ch].label}>
                            <span
                              className="inline-flex size-6 items-center justify-center rounded-md bg-secondary"
                              aria-label={CHANNEL[ch].label}
                            >
                              <Icon className="size-3.5" />
                            </span>
                          </Tooltip>
                        )
                      })}
                    </span>
                  </div>
                  {scheduled ? (
                    <p className="text-xs text-muted-foreground">
                      Will reach {total} people when it goes out.
                    </p>
                  ) : (
                    <div className="grid gap-1.5">
                      <p className="text-xs">
                        <span className="font-medium">
                          {n.readBy} of {total}
                        </span>{' '}
                        <span className="text-muted-foreground">read</span>
                      </p>
                      <Meter value={n.readBy} max={total} label={`${n.readBy} of ${total} read`} />
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editing && (
        <NoticeDialog
          notice={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this notice?"
        confirmLabel="Delete notice"
        destructive
        onConfirm={() => {
          if (!deleting) return
          updateDb((d) => {
            d.notices = d.notices.filter((n) => n.id !== deleting.id)
          })
          toast.success('Notice deleted')
          setDeleting(null)
        }}
      >
        <p>
          “{deleting?.title}” will be removed from the tenant app. Messages already sent on WhatsApp
          or SMS cannot be taken back.
        </p>
      </ConfirmDialog>
    </>
  )
}

function NoticeDialog({ notice, onClose }: { notice?: Notice; onClose: () => void }) {
  const { person } = useSession()
  const db = useDb((d) => d)
  const scheduledOn = useExtras((x) => (notice ? x.noticeSchedule[notice.id] : undefined))
  const openProps = db.properties.filter((p) => p.status !== 'archived')
  const [title, setTitle] = useState(notice?.title ?? '')
  const [body, setBody] = useState(notice?.body ?? '')
  const [propertyIds, setPropertyIds] = useState<string[]>(
    notice?.propertyIds ?? openProps.filter((p) => p.status === 'active').map((p) => p.id),
  )
  const [audience, setAudience] = useState<Audience>(notice?.audience ?? 'tenants')
  const [channels, setChannels] = useState<Channel[]>(notice?.channel ?? ['app', 'whatsapp'])
  const [pinned, setPinned] = useState(notice?.pinned ?? false)
  const [later, setLater] = useState(Boolean(scheduledOn))
  const [sendOn, setSendOn] = useState(scheduledOn ?? addDays(TODAY, 1))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const count = recipients(db, propertyIds, audience)
  const toggleChannel = (c: Channel, on: boolean) =>
    setChannels((list) => (on ? [...list, c] : list.filter((x) => x !== c)))

  function save() {
    const e: Record<string, string> = {}
    if (title.trim().length < 4) e.title = 'Give the notice a short title.'
    if (body.trim().length < 10) e.body = 'Write the message tenants will read.'
    if (!propertyIds.length) e.properties = 'Choose at least one property.'
    if (!channels.length) e.channels = 'Choose how to send it.'
    if (later && sendOn <= TODAY) e.sendOn = 'Choose a date after today.'
    setErrors(e)
    if (Object.keys(e).length) return
    const id = notice?.id ?? newId('n')
    updateDb((d) => {
      const data = {
        title: title.trim(),
        body: body.trim(),
        propertyIds,
        audience,
        channel: channels,
        pinned,
      }
      if (notice) {
        const x = d.notices.find((n) => n.id === notice.id)
        if (x) Object.assign(x, data)
      } else {
        d.notices.unshift({ id, ...data, postedOn: TODAY, postedBy: person.name, readBy: 0 })
      }
    })
    updateExtras((x) => {
      if (later) x.noticeSchedule[id] = sendOn
      else delete x.noticeSchedule[id]
    })
    toast.success(
      notice
        ? 'Notice updated'
        : later
          ? `Notice will go out on ${formatDate(sendOn)}`
          : `Notice sent to ${count} people`,
    )
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={notice ? 'Edit notice' : 'Post notice'}
      description="It shows in the tenant app and goes out on the channels you pick."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>
            {notice ? 'Save changes' : later ? 'Schedule notice' : `Send to ${count} people`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!notice && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Start from a template</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTitle(t.title)
                    setBody(t.body)
                  }}
                  className="rounded-full border bg-card px-3 py-1 text-[13px] hover:bg-secondary"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Title" required error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Message" required error={errors.body} hint={`${body.length} / 500 letters`}>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            className="min-h-28"
          />
        </Field>
        <Field label="Properties" required error={errors.properties}>
          <div className="grid gap-2 rounded-lg border p-3">
            {openProps.map((p) => (
              <CheckboxRow
                key={p.id}
                label={p.name}
                hint={p.locality}
                checked={propertyIds.includes(p.id)}
                onCheckedChange={(v) =>
                  setPropertyIds((list) =>
                    v === true ? [...list, p.id] : list.filter((x) => x !== p.id),
                  )
                }
              />
            ))}
          </div>
        </Field>
        <Field label="Who is it for?">
          <Segmented
            label="Who is it for?"
            value={audience}
            onChange={setAudience}
            options={(Object.keys(AUDIENCE) as Audience[]).map((a) => ({
              value: a,
              label: AUDIENCE[a].label,
            }))}
          />
        </Field>
        <Field label="Send by" error={errors.channels}>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(CHANNEL) as Channel[]).map((c) => {
              const Icon = CHANNEL[c].icon
              const on = channels.includes(c)
              return (
                <label
                  key={c}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm',
                    on && 'border-primary bg-accent',
                  )}
                >
                  <Checkbox checked={on} onCheckedChange={(v) => toggleChannel(c, v === true)} />
                  <Icon className="size-4 text-muted-foreground" />
                  {CHANNEL[c].label}
                </label>
              )
            })}
          </div>
        </Field>
        {channels.includes('sms') && (
          <Alert tone="info">
            SMS costs {formatMoney(SMS_COST)} per message. This notice: {count} ×{' '}
            {formatMoney(SMS_COST)} = <strong>{formatMoney(count * SMS_COST)}</strong>, taken from
            your SMS balance.
          </Alert>
        )}
        <div className="divide-y rounded-lg border px-3">
          <Switch
            checked={pinned}
            onChange={setPinned}
            label="Pin to the top"
            description="Stays first in the tenant app until you unpin it."
          />
          <Switch
            checked={later}
            onChange={setLater}
            label="Send later"
            description="Choose the day it should go out."
          />
          {later && (
            <div className="pb-3">
              <Field label="Send on" error={errors.sendOn}>
                <Input
                  type="date"
                  value={sendOn}
                  min={addDays(TODAY, 1)}
                  onChange={(e) => setSendOn(e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Preview on a phone</p>
          <div className="mx-auto max-w-xs rounded-[2rem] bg-slate-900 p-3 shadow-lg">
            <div className="rounded-[1.5rem] bg-gradient-to-b from-slate-700 to-slate-800 px-3 pt-6 pb-10">
              <p className="mb-4 text-center text-3xl font-light text-white tabular-nums">9:41</p>
              <div className="rounded-2xl bg-white/90 p-3 shadow backdrop-blur">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="flex size-5 items-center justify-center rounded-md bg-primary text-[9px] font-bold text-primary-foreground">
                    AS
                  </span>
                  Asha Stays · now
                </div>
                <p className="mt-1.5 text-[13px] font-semibold text-slate-900">
                  {title || 'Notice title'}
                </p>
                <p className="line-clamp-3 text-xs text-slate-700">
                  {body || 'Your message will show here.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
