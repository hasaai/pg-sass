/** The public home page: what PG Manager does, prices, and where to sign in. */
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  BellRing,
  Building2,
  Check,
  ChevronDown,
  Globe,
  HardHat,
  IdCard,
  IndianRupee,
  KeyRound,
  Smartphone,
  Star,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { toast } from '../../components/ui-kit/toast'
import { plans } from '../../data/seed'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'

const FEATURES = [
  {
    icon: BedDouble,
    title: 'Rooms & beds',
    text: 'See every bed at a glance – filled, vacant, reserved or on notice – across all your PGs.',
  },
  {
    icon: IdCard,
    title: 'Tenants & KYC',
    text: 'Check-in in two minutes with ID proof, emergency contact and a signed agreement.',
  },
  {
    icon: IndianRupee,
    title: 'Rent & UPI reminders',
    text: 'Bills go out on the 1st. Tenants get WhatsApp reminders with your UPI link.',
  },
  {
    icon: Wrench,
    title: 'Complaints',
    text: 'Tenants raise issues from their phone; your caretaker fixes them and you see it all.',
  },
  {
    icon: HardHat,
    title: 'Staff & salaries',
    text: 'Cooks, cleaners and guards: attendance, salary paid and who works where.',
  },
  {
    icon: BarChart3,
    title: 'Reports & profit',
    text: 'Rent collected, expenses and profit per PG, ready to share with your CA.',
  },
  {
    icon: UserCog,
    title: 'Team access',
    text: 'Give your manager, accountant and caretaker only what they need. Caretakers never see money.',
  },
  {
    icon: Globe,
    title: 'Online listing',
    text: 'Publish vacant beds with photos and get enquiries straight into the app.',
  },
]

const TESTIMONIALS = [
  {
    name: 'Lakshmi',
    place: 'Ladies PG, HSR Layout',
    beds: 42,
    quote:
      'I used to spend the first week of every month calling tenants for rent. Now the reminders go by themselves and I just check the list.',
  },
  {
    name: 'Venkatesh',
    place: 'Two men’s PGs, Koramangala',
    beds: 96,
    quote:
      'My manager handles the daily work and I see everything from my phone, even when I am in Mysuru.',
  },
  {
    name: 'Farah',
    place: 'Co-living, BTM Layout',
    beds: 28,
    quote:
      'Check-in with ID proof and agreement takes two minutes. The police verification list is ready when I need it.',
  },
]

const FAQ = [
  [
    'Do I need a computer?',
    'No. PG Manager works fully on your phone. Use a laptop if you like – everything stays in step.',
  ],
  [
    'Is there a free trial?',
    'Yes. Every new account gets 14 days of Pro free, no card needed. After that you can stay on the Free plan for one small PG.',
  ],
  [
    'How do tenants pay rent?',
    'Tenants pay you directly by UPI, bank transfer or cash. The money never passes through us. You or your team record each payment and a receipt goes out.',
  ],
  [
    'Can my staff use it without seeing money?',
    'Yes. Give your caretaker the Caretaker role: they handle complaints, notices and check-ins but never see rent or expenses.',
  ],
  [
    'Is my tenants’ data safe?',
    'Data is stored in India and encrypted. ID documents are private files only you and people you allow can open. We never sell data.',
  ],
  [
    'Can I move from Excel or another app?',
    'Yes. Upload your rooms and tenants from a spreadsheet, or ask us – we will do it for you free on the Pro plan.',
  ],
] as const

function useHashScroll() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }, [hash])
}

function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-tr from-primary/25 via-sky-200/40 to-emerald-200/40 blur-2xl" />
      <div className="rounded-[2.2rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
        <div className="overflow-hidden rounded-[1.6rem] bg-background">
          <div className="flex items-center justify-between bg-card px-4 pt-3 pb-2 text-[11px] text-muted-foreground">
            <span>9:41</span>
            <span className="h-1.5 w-12 rounded-full bg-slate-200" />
            <span>4G</span>
          </div>
          <div className="space-y-3 p-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Good morning, Lakshmi</p>
              <p className="text-sm font-semibold">Monday, 2 November</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">Beds filled</p>
                <p className="text-base font-semibold">38/42</p>
                <div className="mt-1 h-1 rounded-full bg-secondary">
                  <div className="h-1 w-[90%] rounded-full bg-emerald-500" />
                </div>
              </div>
              <div className="rounded-lg border bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">Rent collected</p>
                <p className="text-base font-semibold">₹2.9L</p>
                <p className="text-[10px] text-emerald-700">78% of ₹3.7L</p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-2.5">
              <p className="mb-1.5 text-[11px] font-semibold">Today</p>
              {[
                ['Rahul V · Room 203', '₹8,000 overdue', 'bg-red-500'],
                ['Neha G checks in', 'Room 104 · Bed A', 'bg-sky-500'],
                ['Fan not working', 'Room 302 · new', 'bg-amber-500'],
              ].map(([a, b, c]) => (
                <div key={a} className="flex items-center gap-2 border-t py-1.5 first:border-0">
                  <span className={cn('size-1.5 rounded-full', c)} />
                  <span className="min-w-0 flex-1 truncate text-[11px]">{a}</span>
                  <span className="text-[10px] text-muted-foreground">{b}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <span className="flex-1 rounded-md bg-primary py-1.5 text-center text-[11px] font-medium text-primary-foreground">
                Record payment
              </span>
              <span className="flex-1 rounded-md border bg-card py-1.5 text-center text-[11px] font-medium">
                Add tenant
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ScreenshotBeds() {
  const cells = [
    'f',
    'f',
    'v',
    'f',
    'n',
    'f',
    'f',
    'r',
    'f',
    'v',
    'f',
    'f',
    'f',
    'f',
    'b',
    'f',
    'v',
    'f',
  ]
  const tone: Record<string, string> = {
    f: 'bg-sky-100 border-sky-200',
    v: 'bg-emerald-100 border-emerald-300',
    n: 'bg-amber-100 border-amber-300',
    r: 'bg-violet-100 border-violet-200',
    b: 'bg-slate-100 border-slate-200',
  }
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold">Sunrise PG · 1st floor</p>
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {cells.map((c, i) => (
          <span key={i} className={cn('h-7 rounded border', tone[c])} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-sky-300" />
          Filled
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-emerald-400" />
          Vacant
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-amber-400" />
          On notice
        </span>
      </div>
    </div>
  )
}

function ScreenshotRent() {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold">November rent</p>
      <div className="mt-3 flex h-20 items-end gap-2">
        {[62, 78, 85, 70].map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn('w-full rounded-t', i === 3 ? 'bg-primary' : 'bg-primary/40')}
              style={{ height: `${h}%` }}
            />
            <span className="text-[9px] text-muted-foreground">
              {['Aug', 'Sep', 'Oct', 'Nov'][i]}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
        <span>6 tenants overdue</span>
        <span className="font-semibold">₹48,500</span>
      </div>
    </div>
  )
}

function ScreenshotReminder() {
  return (
    <div className="rounded-xl border bg-[#e7ffdb] p-4 shadow-sm">
      <p className="text-[10px] font-semibold text-emerald-800">WhatsApp</p>
      <div className="mt-2 rounded-lg rounded-tl-none bg-white p-2.5 text-[11px] leading-snug shadow-xs">
        Hi Priya, your rent of <b>₹9,500</b> for November is due on <b>5 Nov</b>. Pay by UPI:
        <span className="text-sky-700"> ashastays@okhdfc</span>. – Sunrise PG
        <span className="mt-1 block text-right text-[9px] text-muted-foreground">9:00 am ✓✓</span>
      </div>
      <div className="mt-2 ml-auto w-fit rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 text-[11px] shadow-xs">
        Paid, thank you!
      </div>
    </div>
  )
}

export function LandingPage() {
  useHashScroll()
  const navigate = useNavigate()
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-accent to-background">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <Badge tone="info" className="mb-4">
              Made for PG owners in Bengaluru
            </Badge>
            <h1 className="text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
              Run your PG from your phone
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Beds, tenants, rent, complaints and staff in one simple app. Rent reminders go out on
              WhatsApp by themselves, so you stop chasing and start relaxing.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/register">
                  Register my PG – free for 14 days
                  <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {['No card needed', 'Works on any phone', 'Set up in 10 minutes'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 text-emerald-600" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* Key numbers */}
      <section className="border-b bg-card">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 text-center md:grid-cols-4">
          {[
            ['1,200+', 'PG owners'],
            ['38,000', 'beds managed'],
            ['₹14 Cr', 'rent tracked every month'],
            ['6 days', 'faster rent collection on average'],
          ].map(([n, l]) => (
            <div key={l}>
              <dt className="sr-only">{l}</dt>
              <dd className="text-3xl font-bold tracking-tight text-primary">{n}</dd>
              <dd className="mt-1 text-sm text-muted-foreground">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary">Everything in one place</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">
            No more registers, Excel sheets and WhatsApp groups
          </h2>
          <p className="mt-3 text-muted-foreground">
            PG Manager does the daily work of running a PG, hostel or co-living – for one building
            or ten.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Screenshots */}
      <section className="border-y bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            See your whole business in seconds
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            A bed map for every floor, rent at a glance and reminders your tenants actually read.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <ScreenshotBeds />
            <ScreenshotRent />
            <ScreenshotReminder />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight">Start in three steps</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            [
              'Register with your mobile',
              'Type your number and the 6-digit code we send. That’s your account.',
              Smartphone,
            ],
            [
              'Add your PG, rooms and beds',
              'Add rooms one by one or a whole floor at once, like 101 to 110.',
              Building2,
            ],
            [
              'Add tenants and collect rent',
              'Bills and WhatsApp reminders go out by themselves every month.',
              BellRing,
            ],
          ].map(([title, text, Icon], i) => {
            const I = Icon as typeof Smartphone
            return (
              <li
                key={title as string}
                className="relative rounded-xl border bg-card p-6 shadow-xs"
              >
                <span className="absolute top-5 right-5 text-4xl font-bold text-secondary">
                  {i + 1}
                </span>
                <I className="size-6 text-primary" />
                <h3 className="mt-4 font-semibold">{title as string}</h3>
                <p className="mt-1.5 text-[13px] text-muted-foreground">{text as string}</p>
              </li>
            )
          })}
        </ol>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Simple prices</h2>
              <p className="mt-2 text-muted-foreground">
                Prices include all features listed. GST extra. Cancel anytime.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Segmented
                label="Billing cycle"
                value={cycle}
                onChange={setCycle}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
              />
              <Badge tone="good">2 months free yearly</Badge>
            </div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => {
              const price = cycle === 'monthly' ? p.pricePerMonth : p.pricePerYear
              return (
                <div
                  key={p.code}
                  className={cn(
                    'relative flex flex-col rounded-xl border bg-card p-5 shadow-xs',
                    p.popular && 'border-primary ring-1 ring-primary',
                  )}
                >
                  {p.popular && (
                    <span className="absolute -top-3 left-5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-3">
                    <span className="text-3xl font-bold tracking-tight">{formatMoney(price)}</span>
                    <span className="text-sm text-muted-foreground">
                      {price ? (cycle === 'monthly' ? ' / month' : ' / year') : ' forever'}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.limits.properties
                      ? `Up to ${p.limits.properties} ${p.limits.properties === 1 ? 'property' : 'properties'}`
                      : 'Unlimited properties'}
                    {' · '}
                    {p.limits.beds ? `${p.limits.beds} beds` : 'unlimited beds'}
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-[13px]">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-5 w-full"
                    variant={p.popular ? 'default' : 'outline'}
                    onClick={() => navigate('/register')}
                  >
                    {p.code === 'free' ? 'Start free' : 'Start 14-day trial'}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight">PG owners like you</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sample stories for this prototype; names changed.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="flex flex-col rounded-xl border bg-card p-6 shadow-xs">
              <div className="flex gap-0.5 text-amber-500" aria-label="5 out of 5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className="size-4 fill-current" />
                ))}
              </div>
              <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t pt-4">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-primary">
                  {t.name[0]}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.place} · {t.beds} beds
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Sign-in options */}
      <section className="border-y bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Sign in</h2>
          <p className="mt-2 text-muted-foreground">Choose who you are.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Link
              to="/login"
              className="group rounded-xl border bg-card p-6 shadow-xs transition hover:border-primary/50 hover:shadow-sm"
            >
              <Building2 className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold">PG owner & team</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Owners, managers, accountants and caretakers sign in here.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Sign in{' '}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
            <button
              type="button"
              onClick={() =>
                toast('The tenant app is coming soon', {
                  description: 'We will tell your PG owner as soon as it is ready.',
                })
              }
              className="group rounded-xl border border-dashed bg-card p-6 text-left shadow-xs"
            >
              <div className="flex items-center justify-between">
                <Users className="size-6 text-muted-foreground" />
                <Badge>Coming soon</Badge>
              </div>
              <h3 className="mt-4 font-semibold">Tenant</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Pay rent, download receipts and raise complaints from your phone.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
                Tell me when it’s ready
              </span>
            </button>
            <Link
              to="/login?team=1"
              className="group rounded-xl border bg-card p-6 shadow-xs transition hover:border-primary/50 hover:shadow-sm"
            >
              <KeyRound className="size-6 text-slate-700" />
              <h3 className="mt-4 font-semibold">PG Manager team</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                For our own support, finance and checking staff only.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Staff sign-in{' '}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight">Questions owners ask</h2>
        <div className="mt-8 divide-y rounded-xl border bg-card">
          {FAQ.map(([q, a], i) => {
            const isOpen = open === i
            return (
              <div key={q}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium"
                >
                  {q}
                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>
                {isOpen && (
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Final call to action */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-6xl rounded-2xl bg-slate-900 px-6 py-12 text-center text-white sm:px-12">
          <h2 className="text-3xl font-bold tracking-tight text-balance">
            Spend less time chasing rent this month
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            Register with your mobile number in one minute. 14 days of Pro free, no card needed.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="bg-white text-slate-900 hover:bg-slate-100">
              <Link to="/register">
                Register my PG
                <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="ghost" asChild className="text-white hover:bg-white/10">
              <a href="https://wa.me/918045678900" target="_blank" rel="noreferrer">
                Talk to us on WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
