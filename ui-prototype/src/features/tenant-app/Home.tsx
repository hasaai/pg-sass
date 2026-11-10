import {
  BedDouble,
  CheckCircle2,
  ChevronRight,
  Copy,
  DoorOpen,
  Gift,
  Megaphone,
  Phone,
  UtensilsCrossed,
  Wifi,
  Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Avatar } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { Dialog } from '../../components/ui-kit/dialog'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { balance, daysLate } from '../../data/selectors'
import { useDb } from '../../data/store'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney, formatMonth, shiftPeriod } from '../../lib/format'
import { WIFI, usePrefs, useWords } from './local'
import { copyText, firstName, useMe } from './me'
import { CardTitle, Pill, TCard } from './ui'

export function Home() {
  const me = useMe()
  const w = useWords()
  const notices = useDb((db) => db.notices)
  const read = usePrefs((p) => p.readNotices)
  const [inviting, setInviting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const latest = useMemo(
    () =>
      notices
        .filter((n) => n.audience !== 'staff' && n.propertyIds.includes(me.property?.id ?? ''))
        .sort(
          (a, b) => Number(b.pinned) - Number(a.pinned) || b.postedOn.localeCompare(a.postedOn),
        )[0],
    [notices, me.property?.id],
  )

  if (!me.tenant)
    return <p className="text-sm text-muted-foreground">Your account was not found.</p>
  const { tenant, current, property, warden } = me
  const due = current ? balance(current) : 0
  const late = current ? daysLate(current) : 0
  const daysToDue = current
    ? Math.round((new Date(current.dueOn).getTime() - new Date(TODAY).getTime()) / 86400000)
    : 0

  async function copyPassword() {
    const ok = await copyText(WIFI.password)
    if (ok) toast.success('Wi-Fi password copied')
    else {
      setShowPassword(true)
      toast.info('Copy is blocked here – the password is shown on the card.')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={tenant.name} hue={tenant.photoHue} size="lg" />
        <div>
          <p className="text-[13px] text-muted-foreground">{w('morning')},</p>
          <h1 className="text-xl font-semibold tracking-tight">{firstName(tenant.name)} 👋</h1>
        </div>
      </div>

      {current && (
        <section
          className={cn(
            'overflow-hidden rounded-3xl p-5 text-white shadow-md',
            current.status === 'paid'
              ? 'bg-gradient-to-br from-emerald-600 to-emerald-700'
              : late > 0
                ? 'bg-gradient-to-br from-red-600 to-rose-700'
                : 'bg-gradient-to-br from-primary to-indigo-700',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] text-white/80">
                {w('rentThisMonth')} · {formatMonth(current.period)}
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
                {formatMoney(current.status === 'paid' ? current.total : due)}
              </p>
            </div>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
              {current.status === 'paid'
                ? 'Paid'
                : late > 0
                  ? `${late} days late`
                  : current.status === 'partly_paid'
                    ? 'Partly paid'
                    : daysToDue === 0
                      ? 'Due today'
                      : `Due in ${daysToDue} days`}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-white/80">
            {current.status === 'paid'
              ? `Thank you! Paid in full. Next bill on 1 ${formatMonth(shiftPeriod(current.period, 1))}.`
              : `Due on ${formatDate(current.dueOn)}${current.paid ? ` · ${formatMoney(current.paid)} already paid` : ''}`}
          </p>
          {current.status === 'paid' ? (
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="mt-4 h-12 w-full rounded-xl text-[15px]"
            >
              <Link to={`/tenant/rent/${current.id}`}>
                <CheckCircle2 /> View receipt
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              size="lg"
              className="mt-4 h-12 w-full rounded-xl bg-white text-[15px] text-foreground hover:bg-white/90"
            >
              <Link to={`/tenant/rent/pay?invoice=${current.id}`}>
                {w('pay')} {formatMoney(due)} {w('payBy')}
              </Link>
            </Button>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[15px] font-semibold">{w('quick')}</h2>
        <div className="grid grid-cols-4 gap-2">
          {[
            {
              to: '/tenant/complaints/new',
              label: w('complaint'),
              icon: Wrench,
              tone: 'bg-orange-100 text-orange-700',
            },
            {
              to: '/tenant/food',
              label: w('food'),
              icon: UtensilsCrossed,
              tone: 'bg-emerald-100 text-emerald-700',
            },
            {
              to: '/tenant/profile/notice',
              label: w('notice'),
              icon: DoorOpen,
              tone: 'bg-blue-100 text-blue-700',
            },
            { to: '', label: w('invite'), icon: Gift, tone: 'bg-pink-100 text-pink-700' },
          ].map((a) => {
            const inner = (
              <>
                <span
                  className={cn('flex size-12 items-center justify-center rounded-2xl', a.tone)}
                >
                  <a.icon className="size-6" />
                </span>
                <span className="text-center text-[12px] leading-tight font-medium">{a.label}</span>
              </>
            )
            const cls =
              'flex flex-col items-center gap-1.5 rounded-2xl p-1.5 hover:bg-secondary/60 active:bg-secondary'
            return a.to ? (
              <Link key={a.label} to={a.to} className={cls}>
                {inner}
              </Link>
            ) : (
              <button key={a.label} type="button" className={cls} onClick={() => setInviting(true)}>
                {inner}
              </button>
            )
          })}
        </div>
      </section>

      {latest && (
        <Link to="/tenant/notices" className="block">
          <TCard className="flex items-start gap-3 hover:bg-secondary/40">
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Megaphone className="size-5" />
              {!read.includes(latest.id) && (
                <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-card" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                {w('latest')} · {formatDate(latest.postedOn)}
              </p>
              <p className="mt-0.5 text-sm font-semibold">{latest.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{latest.body}</p>
            </div>
            <ChevronRight className="mt-3 size-4 text-muted-foreground" />
          </TCard>
        </Link>
      )}

      <TCard>
        <CardTitle action={<Pill tone="info">{me.place}</Pill>}>{w('myRoom')}</CardTitle>
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary">
            <BedDouble className="size-6" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              {me.room
                ? `${me.room.sharing === 1 ? 'Single room' : `${me.room.sharing} sharing`}${me.room.ac ? ' · AC' : ''}${me.room.attachedBath ? ' · Attached bathroom' : ''}`
                : 'No room yet'}
            </p>
            <p className="text-[13px] text-muted-foreground">{property?.name}</p>
          </div>
        </div>
        {me.roommates.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Roommates</p>
            <ul className="flex flex-wrap gap-2">
              {me.roommates.map(({ bed, tenant: t }) => (
                <li
                  key={bed.id}
                  className="flex items-center gap-2 rounded-full bg-secondary py-1 pr-3 pl-1 text-[13px]"
                >
                  {t ? (
                    <>
                      <Avatar name={t.name} hue={t.photoHue} size="sm" />
                      {firstName(t.name)} · Bed {bed.label}
                    </>
                  ) : (
                    <>
                      <span className="flex size-7 items-center justify-center rounded-full bg-card text-xs">
                        {bed.label}
                      </span>
                      Bed {bed.label} ·{' '}
                      {bed.status === 'reserved' ? 'New roommate coming' : 'Empty'}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </TCard>

      <TCard>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Wifi className="size-4" /> Wi-Fi
          </span>
        </CardTitle>
        <div className="grid gap-2">
          <div className="flex items-center justify-between rounded-xl bg-secondary/70 px-3 py-2.5">
            <div>
              <p className="text-xs text-muted-foreground">Network</p>
              <p className="text-sm font-medium">{WIFI.name}</p>
            </div>
            <span className="text-xs text-muted-foreground">Floor 1: {WIFI.floorNetwork}</span>
          </div>
          <button
            type="button"
            onClick={copyPassword}
            className="flex items-center justify-between rounded-xl bg-secondary/70 px-3 py-2.5 text-left active:bg-secondary"
          >
            <div>
              <p className="text-xs text-muted-foreground">Password · tap to copy</p>
              <p className="font-mono text-sm font-medium">
                {showPassword ? WIFI.password : '••••••••••••'}
              </p>
            </div>
            <Copy className="size-4 text-muted-foreground" />
          </button>
        </div>
      </TCard>

      {warden && (
        <TCard className="flex items-center gap-3">
          <Avatar name={warden.name} size="lg" hue={30} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Warden · {warden.shift}</p>
            <p className="text-sm font-semibold">{warden.name}</p>
            <p className="text-[13px] text-muted-foreground">{warden.phone}</p>
          </div>
          <Button
            asChild
            size="icon"
            className="size-12 rounded-full bg-emerald-600 hover:bg-emerald-600/90"
          >
            <a
              href={`tel:+91${warden.phone.replace(/\s/g, '')}`}
              aria-label={`Call ${warden.name}`}
            >
              <Phone className="size-5" />
            </a>
          </Button>
        </TCard>
      )}

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        name={firstName(tenant.name)}
        pg={property?.name ?? ''}
      />
    </div>
  )
}

function InviteDialog({
  open,
  onClose,
  name,
  pg,
}: {
  open: boolean
  onClose: () => void
  name: string
  pg: string
}) {
  const code = `PRIYA500`
  const message = `Hi! I stay at ${pg}, HSR Layout – clean rooms, good food and safe. Use my code ${code} to get ₹500 off your first month: https://pgmanager.in/r/${code.toLowerCase()}`
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Invite a friend"
      description={`When your friend moves in, you both get ₹500 off rent.`}
    >
      <div className="grid gap-4">
        <div className="rounded-2xl border-2 border-dashed border-pink-300 bg-pink-50 p-4 text-center">
          <p className="text-xs text-pink-800">{name}’s invite code</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-pink-900">{code}</p>
        </div>
        <p className="rounded-xl bg-secondary/70 p-3 text-[13px]">{message}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="lg"
            className="h-12 rounded-xl"
            onClick={async () => {
              const ok = await copyText(message)
              toast.success(ok ? 'Invite message copied' : 'Invite code: ' + code)
            }}
          >
            <Copy /> Copy
          </Button>
          <Button
            asChild
            size="lg"
            className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-600/90"
          >
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
            >
              Share on WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
