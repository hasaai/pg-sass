import {
  Armchair,
  BellRing,
  Camera,
  Check,
  Droplets,
  HelpCircle,
  ImagePlus,
  Plus,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Tv,
  UtensilsCrossed,
  Wifi,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { FilterChips } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { EmptyState } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { COMPLAINT_CATEGORY, COMPLAINT_STATUS } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Complaint } from '../../data/types'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/format'
import { ME_ID } from './local'
import { useMe } from './me'
import { Pill, ScreenTitle, TCard } from './ui'

const CATEGORY_ICON: Record<Complaint['category'], ComponentType<{ className?: string }>> = {
  electrical: Zap,
  plumbing: Droplets,
  cleaning: Sparkles,
  wifi: Wifi,
  food: UtensilsCrossed,
  furniture: Armchair,
  appliance: Tv,
  security: ShieldAlert,
  other: HelpCircle,
}
const CATEGORY_TONE: Record<Complaint['category'], string> = {
  electrical: 'bg-amber-100 text-amber-800',
  plumbing: 'bg-sky-100 text-sky-800',
  cleaning: 'bg-emerald-100 text-emerald-800',
  wifi: 'bg-indigo-100 text-indigo-800',
  food: 'bg-orange-100 text-orange-800',
  furniture: 'bg-stone-200 text-stone-800',
  appliance: 'bg-violet-100 text-violet-800',
  security: 'bg-red-100 text-red-700',
  other: 'bg-slate-100 text-slate-700',
}
const TIMES = ['Morning 9–12', 'Afternoon 12–4', 'Evening 4–8', 'Any time'] as const

function useMyComplaints() {
  const all = useDb((db) => db.complaints)
  return useMemo(
    () =>
      all
        .filter((c) => c.tenantId === ME_ID)
        .sort((a, b) => b.raisedOn.localeCompare(a.raisedOn) || b.number.localeCompare(a.number)),
    [all],
  )
}

export function ComplaintList() {
  const list = useMyComplaints()
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open')
  const rows = list.filter((c) =>
    filter === 'all'
      ? true
      : filter === 'open'
        ? c.status === 'open' || c.status === 'in_progress'
        : c.status === 'resolved' || c.status === 'closed',
  )
  return (
    <>
      <ScreenTitle
        title="Complaints"
        subtitle="Tell us what needs fixing. The warden gets it at once."
        action={
          <Button asChild size="sm" className="rounded-full">
            <Link to="/tenant/complaints/new">
              <Plus /> New
            </Link>
          </Button>
        }
      />
      <div className="mb-4">
        <FilterChips
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: 'open',
              label: 'Not fixed yet',
              count: list.filter((c) => c.status === 'open' || c.status === 'in_progress').length,
            },
            {
              value: 'done',
              label: 'Fixed',
              count: list.filter((c) => c.status === 'resolved' || c.status === 'closed').length,
            },
            { value: 'all', label: 'All', count: list.length },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Wrench />}
          title={filter === 'open' ? 'Nothing waiting to be fixed' : 'No complaints here'}
          actions={
            <Button asChild className="rounded-xl">
              <Link to="/tenant/complaints/new">Raise a complaint</Link>
            </Button>
          }
        >
          Something broken or not working? Raise a complaint and track it here.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {rows.map((c) => {
            const Icon = CATEGORY_ICON[c.category]
            const s = COMPLAINT_STATUS[c.status]
            return (
              <li key={c.id}>
                <Link
                  to={`/tenant/complaints/${c.id}`}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs active:bg-secondary"
                >
                  <span
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-xl',
                      CATEGORY_TONE[c.category],
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.title}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {c.number} · {formatDate(c.raisedOn)}
                    </span>
                  </span>
                  <Pill tone={s.tone}>{s.label}</Pill>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export function NewComplaint() {
  const navigate = useNavigate()
  const me = useMe()
  const all = useDb((db) => db.complaints)
  const [category, setCategory] = useState<Complaint['category'] | null>(null)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [photo, setPhoto] = useState(false)
  const [time, setTime] = useState<(typeof TIMES)[number]>('Any time')
  const [enter, setEnter] = useState(true)
  const [tried, setTried] = useState(false)

  const errors = {
    category: !category ? 'Pick what the problem is about.' : undefined,
    title: !title.trim() ? 'Say in a few words what is wrong, like “Fan not working”.' : undefined,
  }

  function submit() {
    setTried(true)
    if (errors.category || errors.title || !category || !me.tenant || !me.property) return
    const id = newId('c')
    const max = all.reduce((m, c) => Math.max(m, Number(c.number.replace(/\D/g, '')) || 0), 0)
    const number = `CMP-${max + 1}`
    const name = me.tenant.name
    const propertyId = me.property.id
    updateDb((db) => {
      db.complaints.unshift({
        id,
        number,
        propertyId,
        tenantId: ME_ID,
        room: me.room?.number,
        category,
        title: title.trim(),
        description: details.trim(),
        priority:
          category === 'security'
            ? 'urgent'
            : category === 'electrical' || category === 'plumbing'
              ? 'high'
              : 'medium',
        status: 'open',
        raisedOn: TODAY,
        updates: [
          {
            on: TODAY,
            by: name,
            text: `Complaint raised from the tenant app. Best time: ${time.toLowerCase()}.${enter ? ' Staff may enter when I am out.' : ' Please come only when I am in.'}${photo ? ' 1 photo added.' : ''}`,
          },
        ],
      })
      logActivity(db, {
        by: name,
        action: `Raised complaint ${number}`,
        target: title.trim(),
        propertyId,
        kind: 'complaint',
      })
    })
    toast.success(`Complaint ${number} sent to the warden`)
    navigate(`/tenant/complaints/${id}`, { replace: true })
  }

  return (
    <>
      <ScreenTitle
        title="Raise a complaint"
        back="/tenant/complaints"
        subtitle={`${me.place} · ${me.property?.name ?? ''}`}
      />
      <div className="grid gap-5">
        <div>
          <p className="mb-2 text-[13px] font-medium">What is it about?</p>
          <div role="radiogroup" aria-label="Category" className="grid grid-cols-3 gap-2">
            {(Object.keys(COMPLAINT_CATEGORY) as Complaint['category'][]).map((k) => {
              const Icon = CATEGORY_ICON[k]
              const on = category === k
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCategory(k)}
                  className={cn(
                    'relative flex flex-col items-center gap-1.5 rounded-2xl border bg-card px-2 py-3 text-[13px] font-medium transition',
                    on ? 'border-primary ring-2 ring-primary/30' : 'hover:bg-secondary/50',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-10 items-center justify-center rounded-xl',
                      CATEGORY_TONE[k],
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  {COMPLAINT_CATEGORY[k]}
                  {on && (
                    <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-white">
                      <Check className="size-3" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {tried && errors.category && (
            <p className="mt-1.5 text-xs font-medium text-destructive">{errors.category}</p>
          )}
        </div>

        <Field label="What is wrong?" required error={tried ? errors.title : undefined}>
          <Input
            className="h-11 rounded-xl"
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="For example: Tap leaking in bathroom"
          />
        </Field>
        <Field label="More details" hint="Where exactly, since when, anything that helps.">
          <Textarea
            className="rounded-xl"
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium">Photo</p>
          {photo ? (
            <div
              className="relative h-28 w-36 overflow-hidden rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, oklch(0.85 0.06 210), oklch(0.62 0.09 250))',
              }}
            >
              <span className="absolute bottom-2 left-2 rounded bg-black/45 px-1.5 py-0.5 text-[11px] text-white">
                IMG_2041.jpg
              </span>
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => setPhoto(false)}
                className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/50 text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPhoto(true)
                toast.success('Photo added')
              }}
              className="flex h-28 w-36 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed text-[13px] text-muted-foreground hover:bg-secondary/50"
            >
              <span className="flex gap-1">
                <Camera className="size-5" />
                <ImagePlus className="size-5" />
              </span>
              Add a photo
            </button>
          )}
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium">Best time to come</p>
          <div className="flex flex-wrap gap-2">
            {TIMES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={time === t}
                onClick={() => setTime(t)}
                className={cn(
                  'h-10 rounded-full border px-4 text-[13px] font-medium',
                  time === t
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-secondary',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={enter}
              onChange={(e) => setEnter(e.target.checked)}
            />
            Staff may enter my room when I am out
          </label>
        </div>

        <Button size="lg" className="h-14 rounded-2xl text-base" onClick={submit}>
          Send complaint
        </Button>
      </div>
    </>
  )
}

export function ComplaintDetail() {
  const { id = '' } = useParams()
  const c = useDb((db) => db.complaints.find((x) => x.id === id && x.tenantId === ME_ID))
  const me = useMe()

  if (!c) {
    return (
      <>
        <ScreenTitle title="Complaint" back="/tenant/complaints" />
        <EmptyState title="This complaint was not found">
          Go back to see your complaints.
        </EmptyState>
      </>
    )
  }
  const complaint = c
  const Icon = CATEGORY_ICON[c.category]
  const s = COMPLAINT_STATUS[c.status]
  const name = me.tenant?.name ?? 'Tenant'

  const steps = [
    { label: 'Raised', done: true, on: c.raisedOn },
    {
      label: c.assignedTo ? `With ${c.assignedTo}` : 'Warden looking at it',
      done: c.status !== 'open' || Boolean(c.assignedTo),
    },
    { label: 'Fixed', done: c.status === 'resolved' || c.status === 'closed', on: c.resolvedOn },
    { label: 'You confirmed', done: c.status === 'closed' },
  ]

  function update(patch: Partial<Complaint>, text: string, message: string) {
    updateDb((db) => {
      db.complaints = db.complaints.map((x) =>
        x.id === complaint.id
          ? { ...x, ...patch, updates: [...x.updates, { on: TODAY, by: name, text }] }
          : x,
      )
    })
    toast.success(message)
  }

  return (
    <>
      <ScreenTitle
        title={c.title}
        back="/tenant/complaints"
        subtitle={`${c.number} · ${COMPLAINT_CATEGORY[c.category]}`}
      />

      <TCard className="mb-4 flex items-center gap-3">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-xl',
            CATEGORY_TONE[c.category],
          )}
        >
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <Pill tone={s.tone}>{s.label}</Pill>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Raised {formatDate(c.raisedOn)}
            {c.room ? ` · Room ${c.room}` : ''}
          </p>
        </div>
      </TCard>

      {c.status === 'resolved' && (
        <TCard className="mb-4 border-emerald-200 bg-emerald-50">
          <p className="text-[15px] font-semibold text-emerald-900">Is it fixed?</p>
          <p className="mt-0.5 text-[13px] text-emerald-900/80">
            {c.assignedTo ?? 'The warden'} marked this as fixed. Please check and tell us.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              size="lg"
              className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-600/90"
              onClick={() =>
                update(
                  { status: 'closed' },
                  'Confirmed it is fixed. Thank you!',
                  'Thanks! Complaint closed.',
                )
              }
            >
              <ThumbsUp /> Yes
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-xl"
              onClick={() =>
                update(
                  { status: 'in_progress', resolvedOn: undefined },
                  'Said it is not fixed yet.',
                  'We told the warden it is not fixed yet',
                )
              }
            >
              <ThumbsDown /> No
            </Button>
          </div>
        </TCard>
      )}

      <TCard className="mb-4">
        <h2 className="mb-3 text-[15px] font-semibold">Progress</h2>
        <ol className="grid gap-0">
          {steps.map((st, i) => (
            <li key={st.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full',
                    st.done ? 'bg-emerald-600 text-white' : 'border-2 border-border bg-card',
                  )}
                >
                  {st.done && <Check className="size-3.5" />}
                </span>
                {i < steps.length - 1 && (
                  <span
                    className={cn('w-0.5 flex-1', st.done ? 'bg-emerald-600' : 'bg-border')}
                    style={{ minHeight: 20 }}
                  />
                )}
              </div>
              <div className="pb-4">
                <p className={cn('text-sm font-medium', !st.done && 'text-muted-foreground')}>
                  {st.label}
                </p>
                {st.on && st.done && (
                  <p className="text-xs text-muted-foreground">{formatDate(st.on)}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </TCard>

      {c.description && (
        <TCard className="mb-4">
          <h2 className="mb-1 text-[15px] font-semibold">Details</h2>
          <p className="text-sm text-muted-foreground">{c.description}</p>
        </TCard>
      )}

      <TCard className="mb-4">
        <h2 className="mb-3 text-[15px] font-semibold">Updates</h2>
        <ul className="grid gap-3">
          {[...c.updates].reverse().map((u, i) => (
            <li key={i} className="text-sm">
              <p>{u.text}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {u.by} · {formatDate(u.on)}
              </p>
            </li>
          ))}
        </ul>
      </TCard>

      {(c.status === 'open' || c.status === 'in_progress') && (
        <Button
          size="lg"
          variant="outline"
          className="h-12 w-full rounded-xl"
          onClick={() =>
            update({}, 'Sent a reminder to the warden.', 'Reminder sent to the warden')
          }
        >
          <BellRing /> Remind the warden
        </Button>
      )}
    </>
  )
}
