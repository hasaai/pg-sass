import { BedDouble, MessageCircle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { AsidePanel, AuthHeading, AuthScreen } from '../../components/PublicLayout'
import { ErrorBanner, TextField } from '../../components/ui'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { MobileCodeForm } from '../../features/onboarding/MobileCodeForm'
import { cn } from '../../lib/cn'
import { useForm } from '../../lib/useForm'

function EmailLogin() {
  const { login } = useAuth()
  const form = useForm({ email: '', password: '' })
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    form.setError(null)
    try {
      // <GuestOnly> then redirects: back to the page that asked, else /app or /platform.
      await login(form.values.email, form.values.password)
    } catch (err) {
      form.setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit} noValidate>
      <ErrorBanner error={form.error} fields={['email', 'password']} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        required
        className="h-10"
        error={form.fieldError('email')}
        {...form.bind('email')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        className="h-10"
        error={form.fieldError('password')}
        {...form.bind('password')}
      />
      <Button type="submit" size="lg" className="w-full" busy={busy}>
        Sign in
      </Button>
    </form>
  )
}

const ROWS = [
  {
    name: 'Priya Sharma',
    place: 'Room 204 · Bed B',
    amount: '₹9,500',
    tone: 'good',
    status: 'Paid',
  },
  {
    name: 'Rahul Kumar',
    place: 'Room 101 · Bed A',
    amount: '₹9,000',
    tone: 'warn',
    status: 'Due 5 Nov',
  },
  {
    name: 'Anjali Menon',
    place: 'Room 302 · Whole room',
    amount: '₹16,000',
    tone: 'bad',
    status: '6 days late',
  },
] as const

/** A still picture of the app: this month's rent at one PG. Decorative only. */
function RentSnapshot() {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">Sri Sai Comforts PG</p>
          <p className="truncate text-xs text-muted-foreground">HSR Layout, Sector 2</p>
        </div>
        <Badge tone="outline">November rent</Badge>
      </div>
      <div className="grid grid-cols-3 divide-x border-b">
        {[
          ['Beds filled', '46', '/52'],
          ['Collected', '₹3,84,500', ''],
          ['Still due', '₹62,000', ''],
        ].map(([label, value, rest]) => (
          <div key={label} className="min-w-0 px-4 py-3">
            <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-[15px] font-semibold tracking-[-0.02em] tabular-nums sm:text-[17px]">
              {value}
              <span className="text-[13px] font-medium text-subtle-foreground">{rest}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="px-4 pt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-[86%] rounded-full bg-primary" />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
          86% of rent collected
        </p>
      </div>
      <ul className="mt-2 divide-y">
        {ROWS.map((r) => (
          <li key={r.name} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
              {r.name
                .split(' ')
                .map((w) => w[0])
                .join('')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{r.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{r.place}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-[13px] font-medium tabular-nums">{r.amount}</span>
              <Badge tone={r.tone} dot className="h-5 px-1.5 text-[11px]">
                {r.status}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t bg-emerald-50/60 px-4 py-2.5 text-[12px] text-emerald-900">
        <MessageCircle className="size-3.5 shrink-0 text-emerald-600" />
        <span className="truncate">Reminder sent to Anjali on WhatsApp · 9:30 am</span>
      </div>
    </div>
  )
}

const POINTS = [
  {
    icon: MessageCircle,
    title: 'Rent reminders on WhatsApp',
    text: 'See who is late and remind them in one tap.',
  },
  {
    icon: BedDouble,
    title: 'Every bed at a glance',
    text: 'Filled, free, reserved or on notice, across all your PGs.',
  },
  {
    icon: ShieldCheck,
    title: 'Your team sees only what you allow',
    text: 'Managers, accountants and caretakers each get their own sign-in.',
  },
]

function LoginAside() {
  return (
    <AsidePanel>
      <p className="text-[13px] font-medium text-primary">PG Manager</p>
      <p className="mt-2 max-w-md text-xl leading-snug font-semibold tracking-[-0.02em] sm:text-[22px]">
        Rent, beds and reminders, ready the moment you sign in.
      </p>
      <div className="mt-6">
        <RentSnapshot />
      </div>
      <ul className="mt-7 grid gap-4">
        {POINTS.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card text-primary shadow-xs">
              <p.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">{p.title}</p>
              <p className="text-[13px] text-muted-foreground">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </AsidePanel>
  )
}

export function LoginPage() {
  const { acceptSession } = useAuth()
  const [mode, setMode] = useState<'mobile' | 'email'>('mobile')

  const tab = (value: 'mobile' | 'email', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={cn(
        'h-8 cursor-pointer rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
        mode === value
          ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(15_23_32/0.08),0_0_0_1px_rgb(15_23_32/0.04)]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )

  return (
    <AuthScreen aside={<LoginAside />}>
      <AuthHeading title="Sign in">
        PG owners, their team and the PG Manager team sign in here.
      </AuthHeading>
      <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-7">
        <div
          className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1"
          role="tablist"
          aria-label="Sign in with"
        >
          {tab('mobile', 'Mobile number')}
          {tab('email', 'Email and password')}
        </div>
        {mode === 'mobile' ? (
          <MobileCodeForm
            startUrl="/auth/login/mobile/start"
            finishUrl="/auth/login/mobile/finish"
            // <GuestOnly> redirects once the session exists.
            onDone={acceptSession}
          />
        ) : (
          <EmailLogin />
        )}
      </div>
      <div className="mt-6 grid gap-2 text-center text-[13px] text-muted-foreground">
        <p>
          Run a PG?{' '}
          <Link to="/register" className="font-medium text-primary no-underline hover:underline">
            Register your business
          </Link>
        </p>
        <p>
          <Link to="/" className="text-muted-foreground no-underline hover:text-foreground">
            Back to the home page
          </Link>
        </p>
      </div>
    </AuthScreen>
  )
}
