import {
  Bell,
  CalendarClock,
  DoorOpen,
  Download,
  Eye,
  FileSignature,
  HeartPulse,
  IdCard,
  Languages,
  LogOut,
  Pencil,
  Phone,
  Settings,
  Upload,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Avatar } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { balance } from '../../data/selectors'
import { logActivity, updateDb } from '../../data/store'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney } from '../../lib/format'
import type { Lang } from './local'
import { ME_ID, updatePrefs, usePrefs } from './local'
import { useMe } from './me'
import { CardTitle, Pill, RowLink, ScreenTitle, TCard } from './ui'
import { Switch } from './Toggle'

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

export function Profile() {
  const me = useMe()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [viewing, setViewing] = useState(false)
  if (!me.tenant) return null
  const t = me.tenant
  const months = Math.max(1, Math.round(daysBetween(t.checkIn, TODAY) / 30))

  return (
    <>
      <div className="mb-5 flex flex-col items-center text-center">
        <Avatar name={t.name} hue={t.photoHue} size="xl" />
        <h1 className="mt-3 text-xl font-semibold tracking-tight">{t.name}</h1>
        <p className="text-[13px] text-muted-foreground">
          +91 {t.phone} · {t.email}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <Pill tone={t.status === 'notice' ? 'warn' : 'good'}>
            {t.status === 'notice' ? `Moving out ${formatDate(t.moveOutOn)}` : 'Staying'}
          </Pill>
          <Pill tone="neutral">
            {t.occupation === 'student' ? 'Student' : 'Working'} · {t.organisation}
          </Pill>
        </div>
      </div>

      <div className="grid gap-4">
        <TCard>
          <CardTitle>My stay</CardTitle>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {(
              [
                ['PG', me.property?.name],
                ['Room', me.place],
                ['Moved in', `${formatDate(t.checkIn)} · ${months} months`],
                ['Rent', `${formatMoney(t.rent)} a month`],
                ['Rent due', `By the ${me.property?.rentDueDay}th`],
                ['Notice period', `${me.property?.noticeDays} days`],
                ['Food', t.food ? 'Included (3 meals)' : 'Not taken'],
                [
                  'Gate closes',
                  me.property?.rules
                    .find((r) => r.startsWith('Gate'))
                    ?.replace('Gate closes at ', '') ?? '—',
                ],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </TCard>

        <TCard>
          <CardTitle action={<Wallet className="size-4 text-muted-foreground" />}>
            Deposit
          </CardTitle>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{formatMoney(t.depositPaid)}</p>
              <p className="text-[13px] text-muted-foreground">
                paid of {formatMoney(t.deposit)} · held by {me.property?.name}
              </p>
            </div>
            <Pill tone={t.depositPaid >= t.deposit ? 'good' : 'warn'}>
              {t.depositPaid >= t.deposit ? 'Fully paid' : 'Part paid'}
            </Pill>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Returned within 7 days of moving out, after the room check.
          </p>
        </TCard>

        <TCard className="p-0">
          <div className="px-4 pt-4">
            <CardTitle>Documents</CardTitle>
          </div>
          <ul className="divide-y">
            <li className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
                <IdCard className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">ID proof · {t.idType}</p>
                <p className="text-[13px] text-muted-foreground">
                  {t.kyc === 'verified'
                    ? 'Checked by the PG'
                    : t.kyc === 'pending'
                      ? 'Sent – the warden is checking'
                      : 'Not uploaded yet'}
                </p>
              </div>
              {t.kyc === 'missing' ? (
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    updateDb((db) => {
                      db.tenants = db.tenants.map((x) =>
                        x.id === ME_ID ? { ...x, kyc: 'pending' } : x,
                      )
                      logActivity(db, {
                        by: t.name,
                        action: 'Uploaded an ID proof from the tenant app',
                        target: t.name,
                        propertyId: t.propertyId,
                        kind: 'tenant',
                      })
                    })
                    toast.success('ID uploaded', {
                      description: 'Only the last 4 digits are kept visible.',
                    })
                  }}
                >
                  <Upload /> Upload
                </Button>
              ) : (
                <Pill tone={t.kyc === 'verified' ? 'good' : 'info'}>
                  {t.kyc === 'verified' ? 'Verified' : 'Checking'}
                </Pill>
              )}
            </li>
            <li className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary">
                <FileSignature className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Rental agreement</p>
                <p className="text-[13px] text-muted-foreground">
                  {t.agreement === 'signed'
                    ? `Signed · from ${formatDate(t.checkIn)}`
                    : t.agreement === 'sent'
                      ? 'Waiting for your signature'
                      : 'Not ready yet'}
                </p>
              </div>
              {t.agreement !== 'not_sent' && (
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="View agreement"
                    onClick={() => setViewing(true)}
                  >
                    <Eye />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Download agreement"
                    onClick={() => toast.success('Agreement saved to Downloads')}
                  >
                    <Download />
                  </Button>
                </div>
              )}
            </li>
          </ul>
        </TCard>

        <TCard>
          <CardTitle
            action={
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            }
          >
            Emergency contact
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <HeartPulse className="size-5" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                {t.emergencyName} · {t.emergencyRelation}
              </p>
              <p className="text-[13px] text-muted-foreground">+91 {t.emergencyPhone}</p>
            </div>
            <Button asChild size="icon" variant="outline" className="rounded-full">
              <a
                href={`tel:+91${t.emergencyPhone.replace(/\s/g, '')}`}
                aria-label={`Call ${t.emergencyName}`}
              >
                <Phone />
              </a>
            </Button>
          </div>
        </TCard>

        <TCard className="overflow-hidden p-0">
          <ul className="divide-y">
            <li>
              <RowLink
                to="/tenant/profile/notice"
                icon={<DoorOpen />}
                title={t.status === 'notice' ? 'My move-out' : 'Give notice to move out'}
                subtitle={
                  t.status === 'notice'
                    ? `Last day ${formatDate(t.moveOutOn)}`
                    : `${me.property?.noticeDays} days’ notice`
                }
              />
            </li>
            <li>
              <RowLink
                to="/tenant/food"
                icon={<UtensilsCrossed />}
                title="Food menu"
                subtitle="This week’s breakfast, lunch and dinner"
              />
            </li>
            <li>
              <RowLink
                to="/tenant/profile/settings"
                icon={<Settings />}
                title="Settings"
                subtitle="Language and notifications"
              />
            </li>
          </ul>
        </TCard>

        <Button
          variant="outline"
          size="lg"
          className="h-12 rounded-xl text-destructive hover:text-destructive"
          onClick={() => navigate('/login')}
        >
          <LogOut /> Sign out
        </Button>
      </div>

      <EmergencyDialog open={editing} onClose={() => setEditing(false)} />
      <Dialog
        open={viewing}
        onOpenChange={setViewing}
        title="Rental agreement"
        description={`${me.property?.name} · ${t.name}`}
      >
        <div className="grid gap-2 rounded-lg border bg-slate-50 p-4 text-[13px] leading-relaxed">
          <p className="text-center font-semibold">LEAVE AND LICENCE AGREEMENT</p>
          <p>
            This agreement is made on {formatDate(t.checkIn)} between {me.property?.name},{' '}
            {me.property?.address}, {me.property?.locality}, Bengaluru (the PG) and {t.name} (the
            resident).
          </p>
          <p>
            1. The resident stays in {me.place} for a monthly rent of {formatMoney(t.rent)}, due by
            the {me.property?.rentDueDay}th of every month.
          </p>
          <p>
            2. A refundable deposit of {formatMoney(t.deposit)} is paid. It is returned after moving
            out, less any dues or damage.
          </p>
          <p>3. The resident gives {me.property?.noticeDays} days’ notice before moving out.</p>
          <p>4. House rules: {me.property?.rules.join('; ')}.</p>
          <p className="pt-2 text-muted-foreground">
            Signed online by both on {formatDate(t.checkIn)}.
          </p>
        </div>
      </Dialog>
    </>
  )
}

function EmergencyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe()
  const t = me.tenant
  const [name, setName] = useState(t?.emergencyName ?? '')
  const [relation, setRelation] = useState(t?.emergencyRelation ?? 'Father')
  const [phone, setPhone] = useState(t?.emergencyPhone ?? '')
  const [tried, setTried] = useState(false)
  const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
  const errors = {
    name: !name.trim() ? 'Type their name.' : undefined,
    phone: !/^[6-9]\d{9}$/.test(digits)
      ? 'Type a 10-digit mobile number.'
      : digits === t?.phone.replace(/\D/g, '')
        ? 'Give someone else’s number, not your own.'
        : undefined,
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Emergency contact"
      description="The PG calls this person only in an emergency."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true)
              if (errors.name || errors.phone) return
              const formatted = `${digits.slice(0, 5)} ${digits.slice(5)}`
              updateDb((db) => {
                db.tenants = db.tenants.map((x) =>
                  x.id === ME_ID
                    ? {
                        ...x,
                        emergencyName: name.trim(),
                        emergencyRelation: relation,
                        emergencyPhone: formatted,
                      }
                    : x,
                )
              })
              toast.success('Emergency contact saved')
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name" required error={tried ? errors.name : undefined}>
          <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Relation">
          <NativeSelect
            className="h-11"
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
          >
            {[
              'Father',
              'Mother',
              'Brother',
              'Sister',
              'Husband',
              'Wife',
              'Guardian',
              'Friend',
              'Other',
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Mobile number" required error={tried ? errors.phone : undefined}>
          <Input
            className="h-11"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  )
}

const REASONS = [
  'Moving to another city',
  'Job or college change',
  'Found a flat',
  'Going home',
  'Not happy with the PG',
  'Other',
]

export function GiveNotice() {
  const me = useMe()
  const navigate = useNavigate()
  const noticeDays = me.property?.noticeDays ?? 30
  const earliest = addDays(TODAY, noticeDays)
  const [date, setDate] = useState(earliest)
  const [reason, setReason] = useState(REASONS[0] ?? '')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [withdraw, setWithdraw] = useState(false)
  const t = me.tenant
  if (!t) return null

  const dues = me.unpaid.reduce((s, i) => s + balance(i), 0)
  const valid = Boolean(date) && date >= TODAY
  const shortDays = valid ? Math.max(0, daysBetween(date, earliest)) : 0
  const shortCharge = Math.round((t.rent / 30) * shortDays)
  const refund = Math.max(0, t.depositPaid - dues - shortCharge)

  if (t.status === 'notice') {
    const left = daysBetween(TODAY, t.moveOutOn ?? TODAY)
    return (
      <>
        <ScreenTitle title="My move-out" back="/tenant/profile" />
        <TCard className="mb-4 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <CalendarClock className="size-7" />
          </span>
          <p className="mt-3 text-sm text-muted-foreground">Your last day</p>
          <p className="text-2xl font-semibold">{formatDate(t.moveOutOn)}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {left > 0 ? `${left} days from today` : 'Today'} · notice given{' '}
            {formatDate(t.noticeGivenOn)}
          </p>
        </TCard>
        <RefundCard
          deposit={t.depositPaid}
          dues={dues}
          shortCharge={0}
          refund={Math.max(0, t.depositPaid - dues)}
        />
        <Alert tone="info" className="my-4" title="Before you leave">
          Clear your room and return the keys and access card to the warden. The room check is done
          on your last day.
        </Alert>
        <Button
          variant="outline"
          size="lg"
          className="h-12 w-full rounded-xl"
          onClick={() => setWithdraw(true)}
        >
          I want to stay – take back notice
        </Button>
        <ConfirmDialog
          open={withdraw}
          onOpenChange={setWithdraw}
          title="Take back your notice?"
          confirmLabel="Yes, I’m staying"
          onConfirm={() => {
            updateDb((db) => {
              db.tenants = db.tenants.map((x) =>
                x.id === ME_ID
                  ? { ...x, status: 'active', noticeGivenOn: undefined, moveOutOn: undefined }
                  : x,
              )
              db.beds = db.beds.map((b) => (b.id === t.bedId ? { ...b, status: 'occupied' } : b))
              logActivity(db, {
                by: t.name,
                action: 'Took back notice to move out',
                target: t.name,
                propertyId: t.propertyId,
                kind: 'tenant',
              })
            })
            toast.success('Notice taken back. Happy to have you!')
            setWithdraw(false)
          }}
        >
          <p>The warden will be told. Your bed stays yours.</p>
        </ConfirmDialog>
      </>
    )
  }

  return (
    <>
      <ScreenTitle
        title="Give notice"
        back="/tenant/profile"
        subtitle={`${me.property?.name} needs ${noticeDays} days’ notice.`}
      />
      <div className="grid gap-4">
        <TCard>
          <Field
            label="Your last day"
            error={!valid ? 'Pick today or a later date.' : undefined}
            hint={shortDays === 0 ? `Full notice – ${formatDate(earliest)} or later.` : undefined}
          >
            <Input
              type="date"
              className="h-12 rounded-xl text-base"
              min={TODAY}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {valid && shortDays > 0 && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              That is {shortDays} days short of the notice period. Rent for those days (
              {formatMoney(shortCharge)}) is kept from your deposit.
            </p>
          )}
        </TCard>

        <TCard className="grid gap-3">
          <p className="text-[13px] font-medium">Why are you leaving?</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                onClick={() => setReason(r)}
                className={cn(
                  'h-10 rounded-full border px-3.5 text-[13px] font-medium',
                  reason === r
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-secondary',
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Field label="Anything else? (optional)">
            <Textarea
              className="rounded-xl"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </TCard>

        <RefundCard deposit={t.depositPaid} dues={dues} shortCharge={shortCharge} refund={refund} />

        <Button
          size="lg"
          className="h-14 rounded-2xl text-base"
          disabled={!valid}
          onClick={() => setConfirm(true)}
        >
          Give notice
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Move out on ${valid ? formatDate(date) : ''}?`}
        confirmLabel="Confirm notice"
        onConfirm={() => {
          updateDb((db) => {
            db.tenants = db.tenants.map((x) =>
              x.id === ME_ID
                ? {
                    ...x,
                    status: 'notice',
                    noticeGivenOn: TODAY,
                    moveOutOn: date,
                    notes: [x.notes, `Notice: ${reason}${note.trim() ? ` – ${note.trim()}` : ''}`]
                      .filter(Boolean)
                      .join('\n'),
                  }
                : x,
            )
            db.beds = db.beds.map((b) => (b.id === t.bedId ? { ...b, status: 'notice' } : b))
            logActivity(db, {
              by: t.name,
              action: `Gave notice to move out on ${formatDate(date)}`,
              target: t.name,
              propertyId: t.propertyId,
              kind: 'tenant',
            })
          })
          toast.success('Notice sent to the PG', {
            description: `Your last day is ${formatDate(date)}.`,
          })
          setConfirm(false)
          navigate('/tenant/profile/notice', { replace: true })
        }}
      >
        <p>
          The owner and warden are told at once. You can take it back later if you change your mind.
        </p>
        <p>
          Estimated deposit refund:{' '}
          <span className="font-semibold text-foreground">{formatMoney(refund)}</span>
        </p>
      </ConfirmDialog>
    </>
  )
}

function RefundCard({
  deposit,
  dues,
  shortCharge,
  refund,
}: {
  deposit: number
  dues: number
  shortCharge: number
  refund: number
}) {
  return (
    <TCard>
      <CardTitle>Deposit refund (estimate)</CardTitle>
      <ul className="grid gap-1.5 text-sm">
        <li className="flex justify-between">
          <span>Deposit paid</span>
          <span className="tabular-nums">{formatMoney(deposit)}</span>
        </li>
        {dues > 0 && (
          <li className="flex justify-between text-red-600">
            <span>Rent not paid yet</span>
            <span className="tabular-nums">− {formatMoney(dues)}</span>
          </li>
        )}
        {shortCharge > 0 && (
          <li className="flex justify-between text-red-600">
            <span>Short notice</span>
            <span className="tabular-nums">− {formatMoney(shortCharge)}</span>
          </li>
        )}
        <li className="mt-1 flex justify-between border-t pt-2 font-semibold">
          <span>You get back</span>
          <span className="tabular-nums">{formatMoney(refund)}</span>
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Paid to your UPI within 7 days of moving out. Damage found in the room check may be taken
        off.
      </p>
    </TCard>
  )
}

export function AppSettings() {
  const navigate = useNavigate()
  const lang = usePrefs((p) => p.lang)
  const notify = usePrefs((p) => p.notify)
  const LANGS: { value: Lang; label: string; sub: string }[] = [
    { value: 'en', label: 'English', sub: 'English' },
    { value: 'kn', label: 'ಕನ್ನಡ', sub: 'Kannada' },
    { value: 'hi', label: 'हिंदी', sub: 'Hindi' },
  ]
  const NOTIFY: { key: keyof typeof notify; label: string; description: string }[] = [
    {
      key: 'rent',
      label: 'Rent reminders',
      description: '3 days before rent is due and on the due day',
    },
    { key: 'notices', label: 'New notices', description: 'Water cuts, events and house rules' },
    {
      key: 'complaints',
      label: 'Complaint updates',
      description: 'When someone starts or finishes the work',
    },
    {
      key: 'whatsapp',
      label: 'Also on WhatsApp',
      description: 'Get the same messages on WhatsApp',
    },
  ]
  return (
    <>
      <ScreenTitle title="Settings" back="/tenant/profile" />
      <div className="grid gap-4">
        <TCard>
          <CardTitle action={<Languages className="size-4 text-muted-foreground" />}>
            Language
          </CardTitle>
          <div role="radiogroup" aria-label="Language" className="grid grid-cols-3 gap-2">
            {LANGS.map((l) => (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={lang === l.value}
                onClick={() => {
                  updatePrefs((p) => {
                    p.lang = l.value
                  })
                  toast.success(`App language: ${l.label}`)
                }}
                className={cn(
                  'flex flex-col items-center rounded-2xl border px-2 py-3',
                  lang === l.value
                    ? 'border-primary bg-accent ring-2 ring-primary/30'
                    : 'bg-card hover:bg-secondary/50',
                )}
              >
                <span className="text-base font-semibold">{l.label}</span>
                <span className="text-xs text-muted-foreground">{l.sub}</span>
              </button>
            ))}
          </div>
        </TCard>
        <TCard>
          <CardTitle action={<Bell className="size-4 text-muted-foreground" />}>
            Notifications
          </CardTitle>
          <div className="divide-y">
            {NOTIFY.map((n) => (
              <Switch
                key={n.key}
                label={n.label}
                description={n.description}
                checked={notify[n.key]}
                onChange={(v) => {
                  updatePrefs((p) => {
                    p.notify[n.key] = v
                  })
                  toast.success(`${n.label} ${v ? 'on' : 'off'}`)
                }}
              />
            ))}
          </div>
        </TCard>
        <Button
          variant="outline"
          size="lg"
          className="h-12 rounded-xl text-destructive hover:text-destructive"
          onClick={() => navigate('/login')}
        >
          <LogOut /> Sign out
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          PG Manager tenant app · version 1.4.0
        </p>
      </div>
    </>
  )
}
