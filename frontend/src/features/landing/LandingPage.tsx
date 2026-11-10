import {
  ArrowRight,
  BedDouble,
  Building2,
  Check,
  CheckCheck,
  FileLock2,
  History,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Search,
  Smartphone,
  Users,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { homeFor } from '../../auth/redirects'
import { BrandLink, BrandMark } from '../../components/PublicLayout'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { cn } from '../../lib/cn'
import { FEATURES } from './features'
import type { Icon } from './features'

const STEPS = [
  {
    title: 'Sign up',
    text: 'Sign up with your mobile number and confirm the 6-digit code.',
  },
  { title: 'Add your PG', text: 'Add your property, its rooms and beds.' },
  { title: 'Check tenants in', text: 'Add tenants and check them in.' },
  {
    title: 'Collect rent',
    text: 'Rent bills are made every month; record payments and share receipts.',
  },
]

const SAFE = [
  {
    icon: Building2,
    text: 'Each business sees only its own properties, tenants and money.',
  },
  { icon: FileLock2, text: 'Documents are private; every download is recorded.' },
  {
    icon: Smartphone,
    text: 'Every sign-up confirms a mobile number with a one-time code.',
  },
  {
    icon: History,
    text: 'An activity log shows who changed money, team access and documents.',
  },
]

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6'
const navLink =
  'hidden rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:text-foreground md:inline'

function SectionHead({
  eyebrow,
  title,
  text,
  center,
}: {
  eyebrow: string
  title: string
  text?: string
  center?: boolean
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="text-[13px] font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-[26px] leading-tight font-semibold tracking-[-0.025em] sm:text-[32px]">
        {title}
      </h2>
      {text && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{text}</p>}
    </div>
  )
}

/* ---------- Hero product preview (decorative; hidden from screen readers) ---------- */

const PREVIEW_NAV: { icon: Icon; label: string; active?: boolean }[] = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Building2, label: 'Properties' },
  { icon: BedDouble, label: 'Rooms & beds' },
  { icon: Users, label: 'Tenants' },
  { icon: IndianRupee, label: 'Rent' },
  { icon: Receipt, label: 'Expenses' },
  { icon: Wrench, label: 'Complaints' },
]

const PREVIEW_ROWS = [
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
  {
    name: 'Mohammed Irfan',
    place: 'Room 103 · Bed C',
    amount: '₹8,500',
    tone: 'good',
    status: 'Paid',
  },
] as const

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
}

function HeroPreview() {
  return (
    <div aria-hidden className="relative">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(15_23_32/0.04),0_24px_48px_-24px_rgb(15_23_32/0.18)]">
        {/* top bar */}
        <div className="flex h-11 items-center gap-3 border-b bg-sidebar px-3.5">
          <BrandMark className="size-6 [&_svg]:size-3.5" />
          <span className="truncate text-[12px] font-semibold">Sri Sai Comforts PG</span>
          <span className="ml-auto hidden h-7 w-44 items-center gap-2 rounded-md border bg-card px-2.5 text-[11px] text-subtle-foreground sm:flex">
            <Search className="size-3" /> Search tenants, rooms…
          </span>
          <span className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br sm:ml-0 from-[oklch(0.5_0.09_178)] to-[oklch(0.32_0.06_200)] text-[9px] font-semibold text-white">
            AR
          </span>
        </div>
        <div className="flex">
          {/* sidebar */}
          <div className="hidden w-[150px] shrink-0 border-r bg-sidebar p-2 sm:block lg:w-[180px]">
            {PREVIEW_NAV.map((n) => (
              <div
                key={n.label}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] font-medium',
                  n.active
                    ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(15_23_32/0.08),0_0_0_1px_rgb(15_23_32/0.04)]'
                    : 'text-muted-foreground',
                )}
              >
                <n.icon className={cn('size-3.5', n.active && 'text-primary')} />
                {n.label}
              </div>
            ))}
          </div>
          {/* content */}
          <div className="min-w-0 flex-1 p-3.5 sm:p-4">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold tracking-[-0.015em]">
                  Good morning, Asha
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  HSR Layout · 3 properties
                </p>
              </div>
              <span className="shrink-0 rounded-md border bg-card px-2 py-1 text-[11px] font-medium">
                November 2026
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="min-w-0 rounded-lg border p-2.5">
                <p className="truncate text-[10.5px] font-medium text-muted-foreground">
                  Beds filled
                </p>
                <p className="mt-1 text-[16px] leading-none font-semibold tracking-[-0.025em] tabular-nums sm:text-[18px]">
                  46<span className="text-[12px] text-subtle-foreground">/52</span>
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-[88%] rounded-full bg-primary" />
                </div>
              </div>
              <div className="min-w-0 rounded-lg border p-2.5">
                <p className="truncate text-[10.5px] font-medium text-muted-foreground">
                  Collected
                </p>
                <p className="mt-1 truncate text-[16px] leading-none font-semibold tracking-[-0.025em] tabular-nums sm:text-[18px]">
                  ₹3,84,500
                </p>
                <p className="mt-1.5 truncate text-[10px] text-emerald-700">86% of ₹4,46,500</p>
              </div>
              <div className="min-w-0 rounded-lg border p-2.5">
                <p className="truncate text-[10.5px] font-medium text-muted-foreground">Late</p>
                <p className="mt-1 truncate text-[16px] leading-none font-semibold tracking-[-0.025em] text-red-700 tabular-nums sm:text-[18px]">
                  ₹62,000
                </p>
                <p className="mt-1.5 truncate text-[10px] text-muted-foreground">5 tenants</p>
              </div>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border">
              <div className="flex items-center justify-between border-b bg-secondary/60 px-2.5 py-1.5 text-[10.5px] font-medium text-muted-foreground">
                <span>Rent this month</span>
                <span>Amount</span>
              </div>
              {PREVIEW_ROWS.map((r) => (
                <div
                  key={r.name}
                  className="flex items-center gap-2.5 border-b px-2.5 py-2 last:border-b-0"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[9.5px] font-semibold text-secondary-foreground">
                    {initials(r.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">{r.name}</p>
                    <p className="truncate text-[10.5px] text-muted-foreground">{r.place}</p>
                  </div>
                  <span className="hidden text-[12px] font-medium tabular-nums min-[420px]:inline">
                    {r.amount}
                  </span>
                  <Badge tone={r.tone} dot className="h-5 shrink-0 px-1.5 text-[10.5px]">
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* WhatsApp reminder, floating over the corner on large screens */}
      <div className="absolute bottom-5 -left-6 hidden w-[205px] rounded-xl border bg-card p-3 shadow-[0_1px_2px_rgb(15_23_32/0.05),0_16px_32px_-12px_rgb(15_23_32/0.2)] lg:block">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white">
            <MessageCircle className="size-3" />
          </span>
          WhatsApp reminder to Anjali
        </div>
        <p className="mt-2 rounded-lg rounded-tl-sm bg-emerald-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-emerald-950">
          Hi Anjali, rent of <b className="tabular-nums">₹16,000</b> for November is 6 days late.
          Please pay by UPI today. – Sri Sai Comforts PG
          <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-emerald-700/80">
            9:30 am <CheckCheck className="size-3 text-sky-500" />
          </span>
        </p>
      </div>
    </div>
  )
}

/* ---------- Rent reminder spotlight (decorative list) ---------- */

const LATE = [
  { name: 'Anjali Menon', place: 'Room 302', amount: '₹16,000', days: '6 days late', sent: true },
  { name: 'Karthik Rao', place: 'Room 208 · Bed A', amount: '₹9,000', days: '3 days late' },
  { name: 'Sneha Pillai', place: 'Room 105 · Bed B', amount: '₹8,500', days: '2 days late' },
]

function ReminderPreview() {
  return (
    <div aria-hidden className="rounded-2xl border bg-card p-2 shadow-xs">
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-3">
        <p className="text-[13px] font-semibold">Late this month</p>
        <span className="text-[12px] text-muted-foreground tabular-nums">₹33,500 · 3 tenants</span>
      </div>
      <div className="grid gap-1.5">
        {LATE.map((t) => (
          <div
            key={t.name}
            className="flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
              {initials(t.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{t.name}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {t.place} · <span className="text-red-700">{t.days}</span>
              </p>
            </div>
            <span className="hidden text-[13px] font-medium tabular-nums sm:inline">
              {t.amount}
            </span>
            {t.sent ? (
              <span className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium text-emerald-700">
                <Check className="size-3.5" /> Sent
              </span>
            ) : (
              <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border-strong/80 bg-card px-2 text-[11.5px] font-medium shadow-xs">
                <MessageCircle className="size-3.5 text-emerald-600" /> Remind
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Sign-in options ---------- */

function LoginCard({
  icon: IconComponent,
  title,
  text,
  badge,
  children,
}: {
  icon: Icon
  title: string
  text: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-5 shadow-xs sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg border bg-gradient-to-b from-card to-secondary text-primary shadow-xs">
          <IconComponent className="size-5" />
        </span>
        {badge}
      </div>
      <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{text}</p>
      <div className="mt-6 flex flex-wrap gap-2 pt-1 sm:mt-auto">{children}</div>
    </div>
  )
}

/** The front page: what PG Manager does, and where each kind of person signs in. */
export function LandingPage() {
  const { status, membership, user } = useAuth()
  const signedIn = status === 'authenticated'
  const home = homeFor(Boolean(membership), Boolean(user?.is_platform_admin))

  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95">
        <div className={cn(container, 'flex h-14 items-center justify-between gap-3')}>
          <BrandLink />
          <nav aria-label="Page" className="flex items-center gap-1 sm:gap-1.5">
            <a href="#features" className={navLink}>
              Features
            </a>
            <a href="#how-it-works" className={navLink}>
              How it works
            </a>
            <a href="#sign-in" className={cn(navLink, 'mr-2')}>
              Sign in options
            </a>
            {signedIn ? (
              <Button asChild size="sm">
                <Link to={home}>Open my account</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Start free trial</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="border-b bg-[linear-gradient(to_bottom,var(--color-card),var(--color-background))]">
          <div
            className={cn(
              container,
              'grid items-center gap-12 pt-12 pb-16 sm:pt-20 sm:pb-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14',
            )}
          >
            <div className="animate-in">
              <span className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-[12px] font-medium text-muted-foreground shadow-xs">
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-accent-foreground">
                  Bengaluru
                </span>
                For PG and co-living owners
              </span>
              <h1 className="mt-5 text-[34px] leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[48px] lg:text-[52px]">
                Run every PG, room, tenant and rupee from one screen
              </h1>
              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
                Beds, check-ins, rent, reminders, expenses, staff and complaints, for one PG or
                many. Start with a 14-day free trial of the Pro plan; no card needed.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {signedIn ? (
                  <Button asChild size="lg">
                    <Link to={home}>
                      Open my account <ArrowRight />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild size="lg">
                      <Link to="/register">
                        Start free trial <ArrowRight />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <a href="#sign-in">Sign in</a>
                    </Button>
                  </>
                )}
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
                {['14 days of Pro, free', 'No card needed', 'Works on any phone'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-primary" strokeWidth={2.5} aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <HeroPreview />
          </div>
        </section>

        {/* Who it is for */}
        <section aria-label="Property types" className="border-b">
          <div
            className={cn(
              container,
              'flex flex-wrap items-center justify-center gap-x-8 gap-y-2 py-6 text-[13px] text-muted-foreground',
            )}
          >
            <span className="font-medium text-foreground">Made for</span>
            {['PGs', 'Co-living', 'Hostels', 'Flats and houses', 'One property or many'].map(
              (t) => (
                <span key={t}>{t}</span>
              ),
            )}
          </div>
        </section>

        {/* Features */}
        <section id="features" className={cn(container, 'scroll-mt-20 py-16 sm:py-24')}>
          <SectionHead
            eyebrow="Features"
            title="Everything a PG needs"
            text="Works on a phone at the property and on a laptop at the office."
          />
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-card p-5 sm:p-6">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-accent-foreground">
                  <f.icon className="size-[18px]" />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Reminder spotlight */}
        <section className="border-y bg-[oklch(0.972_0.006_190)]">
          <div
            className={cn(
              container,
              'grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16',
            )}
          >
            <div>
              <SectionHead
                eyebrow="Rent reminders"
                title="Fewer calls on the 5th of every month"
                text="PG Manager knows who has paid, who paid part and who is late. Send a polite reminder on WhatsApp in one tap, with the right amount and month already written."
              />
              <ul className="mt-6 grid gap-2.5 text-[14px]">
                {[
                  'Part payments and extras like a balcony or meals are counted',
                  'Receipts you can share the moment rent is paid',
                  'A rent due day for each property, and a list of who is late',
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <ReminderPreview />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className={cn(container, 'scroll-mt-20 py-16 sm:py-24')}>
          <SectionHead eyebrow="How it works" title="Up and running in a day" />
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-xl border bg-card p-4 shadow-xs sm:block sm:p-5"
              >
                <div className="flex shrink-0 items-center gap-3 self-start pt-0.5 sm:pt-0">
                  <span className="flex size-7 items-center justify-center rounded-full bg-foreground font-mono text-[12px] font-semibold text-background tabular-nums">
                    {i + 1}
                  </span>
                  <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h3 className="mt-0.5 text-[15px] sm:mt-4 font-semibold tracking-[-0.01em]">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Sign-in options */}
        <section id="sign-in" className="scroll-mt-20 border-y bg-secondary/50">
          <div className={cn(container, 'py-16 sm:py-24')}>
            <SectionHead
              eyebrow="Sign in"
              title="Who are you?"
              text="Everyone signs in with their own account. You only see what your role allows."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <LoginCard
                icon={Building2}
                title="PG owners and their team"
                text="Owners, managers, accountants and caretakers. New owners create a business in 2 minutes."
              >
                <Button asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/register">Register my PG</Link>
                </Button>
              </LoginCard>
              <LoginCard
                icon={Users}
                title="Tenants"
                text="See your bills, receipts and notices, and raise complaints. Your PG will send you a link to sign in with your mobile number."
                badge={<Badge tone="info">Soon</Badge>}
              >
                <Button disabled variant="outline">
                  <Smartphone /> Coming soon
                </Button>
              </LoginCard>
              <LoginCard
                icon={KeyRound}
                title="PG Manager team"
                text="Our staff: support, finance and property checking. Use the account your Platform owner created for you."
              >
                <Button asChild variant="outline">
                  <Link to="/login">Team sign in</Link>
                </Button>
              </LoginCard>
            </div>
          </div>
        </section>

        {/* Data safety */}
        <section className={cn(container, 'py-16 sm:py-24')}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <SectionHead
              eyebrow="Trust"
              title="Your data stays yours"
              text="Tenant details, rent and documents are kept private to your business."
            />
            <ul className="grid gap-3 sm:grid-cols-2">
              {SAFE.map((s) => (
                <li
                  key={s.text}
                  className="flex gap-3 rounded-xl border bg-card p-4 text-[14px] leading-relaxed shadow-xs"
                >
                  <s.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {s.text}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final call to action */}
        <section className={cn(container, 'pb-16 sm:pb-24')}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-ink px-6 py-10 text-white sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-[24px] leading-tight font-semibold tracking-[-0.025em] sm:text-[28px]">
                Try it with your own PG
              </h2>
              <p className="mt-2 text-[15px] text-white/70">
                14 days of the Pro plan free. Then pick the plan that fits, or stay on Free.
              </p>
            </div>
            {!signedIn && (
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-white text-ink hover:bg-white/90">
                  <Link to="/register">Start free trial</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-white ring-1 ring-white/25 hover:bg-white/10"
                >
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t bg-card/60">
        <div
          className={cn(
            container,
            'flex flex-col gap-8 py-10 sm:flex-row sm:items-start sm:justify-between',
          )}
        >
          <div className="max-w-xs">
            <BrandLink />
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              PG Manager · Bengaluru. Software for PG, hostel and co-living owners.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-[13px] sm:grid-cols-3">
            {[
              {
                title: 'Product',
                links: [
                  { label: 'Features', to: '#features' },
                  { label: 'How it works', to: '#how-it-works' },
                ],
              },
              {
                title: 'Account',
                links: [
                  { label: 'Sign in', to: '/login' },
                  { label: 'Free trial', to: '/register' },
                ],
              },
              {
                title: 'Legal',
                links: [
                  { label: 'Terms', to: '/terms' },
                  { label: 'Privacy', to: '/privacy' },
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <p className="font-medium text-foreground">{col.title}</p>
                <ul className="mt-3 grid gap-2">
                  {col.links.map(({ label, to }) => (
                    <li key={label}>
                      {to.startsWith('#') ? (
                        <a
                          href={to}
                          className="text-muted-foreground no-underline hover:text-foreground"
                        >
                          {label}
                        </a>
                      ) : (
                        <Link
                          to={to}
                          className="text-muted-foreground no-underline hover:text-foreground"
                        >
                          {label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
