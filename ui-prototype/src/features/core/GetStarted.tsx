/** Onboarding checklist for a new owner. Nothing here blocks using the app. */
import { ArrowRight, Check, Clock, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Alert, PageHeader } from '../../components/ui-kit/feedback'
import { toast } from '../../components/ui-kit/toast'
import { OWNER_CHECK } from '../../data/selectors'
import { useDb } from '../../data/store'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { NoAccess } from '../../components/common'
import { ProgressRing } from './parts'
import { onboardingStore } from './util'

type State = 'done' | 'todo' | 'waiting' | 'locked'

interface Step {
  key: string
  title: string
  why: string
  state: State
  note?: string
  action?: ReactNode
}

const STATE_BADGE: Record<State, ReactNode> = {
  done: <Badge tone="good">Done</Badge>,
  todo: <Badge>To do</Badge>,
  waiting: <Badge tone="info">Being checked</Badge>,
  locked: <Badge tone="warn">Needs earlier steps</Badge>,
}

export function GetStartedPage() {
  useBreadcrumbs([{ label: 'Dashboard', to: '/app' }, { label: 'Get started' }])
  const navigate = useNavigate()
  const { role } = useSession()
  const business = useDb((db) => db.business)
  const properties = useDb((db) => db.properties)
  const rooms = useDb((db) => db.rooms)
  const tenants = useDb((db) => db.tenants)
  const members = useDb((db) => db.members)
  const flags = onboardingStore.use()

  if (role !== 'owner') return <NoAccess what="the get-started checklist" />

  const hasVerifiedProperty = properties.some((p) => p.verification === 'verified')
  const ownerOk = business.verification === 'approved'
  const ownerWaiting =
    business.verification === 'submitted' || business.verification === 'under_review'
  const go = (to: string) => () => navigate(to)

  const steps: Step[] = [
    {
      key: 'mobile',
      title: 'Confirm your mobile number',
      why: 'You sign in with it and tenants see it on receipts.',
      state: 'done',
      note: business.phone,
    },
    {
      key: 'about',
      title: 'Tell us about you',
      why: 'Your name and business name appear on bills and receipts.',
      state: 'done',
      note: `${business.ownerName} · ${business.name}`,
    },
    {
      key: 'email',
      title: 'Confirm your email',
      why: 'So plan bills and receipt copies reach you. Nothing waits for it.',
      state: business.emailConfirmed ? 'done' : 'todo',
      note: business.email,
      action: business.emailConfirmed ? undefined : (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.success(`Link sent again to ${business.email}`)}
          >
            Send the link again
          </Button>
          <Button size="sm" variant="ghost" onClick={go('/confirm-email')}>
            Open link (demo)
          </Button>
        </>
      ),
    },
    {
      key: 'property',
      title: 'Add your first property',
      why: 'The building’s name, address and rules. Takes 2 minutes.',
      state: properties.length ? 'done' : 'todo',
      note: properties.length ? plural(properties.length, 'property', 'properties') : undefined,
      action: properties.length ? (
        <Button size="sm" variant="ghost" onClick={go('/app/properties')}>
          See properties
        </Button>
      ) : (
        <Button size="sm" onClick={go('/app/properties/new')}>
          Add property
        </Button>
      ),
    },
    {
      key: 'rooms',
      title: 'Add rooms and beds',
      why: 'Add one room or a whole floor at once (101 to 110). Then you see every vacant bed.',
      state: rooms.length ? 'done' : properties.length ? 'todo' : 'locked',
      note: rooms.length ? plural(rooms.length, 'room') : undefined,
      action: (
        <Button
          size="sm"
          variant={rooms.length ? 'ghost' : 'default'}
          disabled={!properties.length}
          onClick={go(properties[0] ? `/app/properties/${properties[0].id}` : '/app/properties')}
        >
          {rooms.length ? 'See rooms' : 'Add rooms'}
        </Button>
      ),
    },
    {
      key: 'tenants',
      title: 'Add your tenants',
      why: 'One by one, or upload your Excel sheet. Bills start from next month.',
      state: tenants.length ? 'done' : rooms.length ? 'todo' : 'locked',
      note: tenants.length
        ? plural(tenants.filter((t) => t.status !== 'moved_out').length, 'tenant')
        : undefined,
      action: (
        <Button
          size="sm"
          variant={tenants.length ? 'ghost' : 'default'}
          onClick={go(tenants.length ? '/app/tenants' : '/app/tenants/new')}
        >
          {tenants.length ? 'See tenants' : 'Add tenant'}
        </Button>
      ),
    },
    {
      key: 'rent',
      title: 'Set rent day and reminders',
      why: 'When bills go out, late fee, and when WhatsApp reminders are sent.',
      state: flags.rentSettingsSaved ? 'done' : 'todo',
      action: (
        <Button
          size="sm"
          variant={flags.rentSettingsSaved ? 'ghost' : 'default'}
          onClick={go('/app/settings?tab=rent')}
        >
          {flags.rentSettingsSaved ? 'Change' : 'Set up'}
        </Button>
      ),
    },
    {
      key: 'identity',
      title: 'Verify your identity',
      why: 'Needed only to publish listings online. Builds trust with tenants.',
      state: ownerOk ? 'done' : ownerWaiting ? 'waiting' : 'todo',
      note: OWNER_CHECK[business.verification].label,
      action: (
        <Button
          size="sm"
          variant={ownerOk || ownerWaiting ? 'ghost' : 'default'}
          onClick={go('/app/verify-identity')}
        >
          {ownerOk || ownerWaiting ? 'See status' : 'Verify now'}
        </Button>
      ),
    },
    {
      key: 'team',
      title: 'Invite your team',
      why: 'Give your manager, accountant or caretaker their own sign-in with only what they need.',
      state: members.length > 1 ? 'done' : 'todo',
      note:
        members.length > 1
          ? plural(members.length - 1, 'person', 'people') + ' invited'
          : undefined,
      action: (
        <Button
          size="sm"
          variant={members.length > 1 ? 'ghost' : 'default'}
          onClick={go('/app/team')}
        >
          {members.length > 1 ? 'See team' : 'Invite'}
        </Button>
      ),
    },
    {
      key: 'listing',
      title: 'Publish your listing',
      why: 'Show vacant beds online and get enquiries in the app.',
      state: flags.listingPublished ? 'done' : hasVerifiedProperty && ownerOk ? 'todo' : 'locked',
      note: !hasVerifiedProperty
        ? 'Needs a verified property'
        : !ownerOk
          ? 'Needs your identity verified'
          : undefined,
      action: (
        <Button size="sm" variant="outline" onClick={go('/app/listings')}>
          {hasVerifiedProperty && ownerOk ? 'Publish' : 'See what’s needed'}
        </Button>
      ),
    },
  ]

  const done = steps.filter((s) => s.state === 'done').length
  const next = steps.find((s) => s.state === 'todo')

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Get started" description="Set up PG Manager at your own pace." />

      <div className="mb-5 flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs sm:flex-row sm:items-center">
        <ProgressRing value={done} max={steps.length} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">
            {done} of {steps.length} done
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(done / steps.length) * 100}%` }}
            />
          </div>
          {next && (
            <p className="mt-2 text-sm text-muted-foreground">
              Next: <span className="font-medium text-foreground">{next.title}</span>
            </p>
          )}
        </div>
      </div>

      <Alert tone="info" className="mb-5" title="Nothing here blocks you">
        You can use every part of the app right now – add tenants, record rent, handle complaints –
        in any order. Only publishing a listing online waits for the identity check.
      </Alert>

      <ol className="grid gap-3">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              'flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center',
              s === next && 'border-primary/50 ring-1 ring-primary/30',
            )}
          >
            <div className="flex min-w-0 flex-1 gap-3">
              <span
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  s.state === 'done' && 'border-emerald-600 bg-emerald-600 text-white',
                  s.state === 'waiting' && 'border-blue-300 bg-blue-50 text-blue-700',
                  s.state === 'locked' && 'bg-secondary text-muted-foreground',
                )}
                aria-hidden
              >
                {s.state === 'done' ? (
                  <Check className="size-4" />
                ) : s.state === 'waiting' ? (
                  <Clock className="size-3.5" />
                ) : s.state === 'locked' ? (
                  <Lock className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn('font-medium', s.state === 'done' && 'text-muted-foreground')}>
                    {s.title}
                  </p>
                  {STATE_BADGE[s.state]}
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{s.why}</p>
                {s.note && <p className="mt-1 truncate text-xs text-muted-foreground">{s.note}</p>}
              </div>
            </div>
            {s.action && (
              <div className="flex shrink-0 flex-wrap gap-2 pl-10 sm:pl-0">{s.action}</div>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-6 flex justify-end">
        <Button variant="outline" onClick={() => navigate('/app')}>
          Go to dashboard <ArrowRight />
        </Button>
      </div>
    </div>
  )
}
