/** Help & support: articles, videos, contact and raising a ticket. */
import {
  BookOpen,
  ChevronRight,
  Keyboard,
  LifeBuoy,
  Mail,
  MessageCircle,
  Phone,
  PlayCircle,
  Ticket,
} from 'lucide-react'
import { useState } from 'react'

import { SearchBox, Section } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Dialog } from '../../components/ui-kit/dialog'
import { EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { newId, updateDb, useDb } from '../../data/store'
import type { Priority } from '../../data/types'
import { useBreadcrumbs } from '../../shell/crumbs'

const ARTICLES = [
  {
    id: 'h1',
    topic: 'Getting started',
    title: 'Add your first property, rooms and beds',
    mins: 3,
    steps: [
      'Open Properties and tap “Add property”.',
      'Type the name, address and who it is for (men, women or anyone).',
      'Open the property and tap “Add rooms”. Type a range like 101 to 110 to add a whole floor at once.',
      'Set the sharing (2 sharing, 3 sharing) and rent per bed. Beds are made for you.',
    ],
  },
  {
    id: 'h2',
    topic: 'Rent',
    title: 'Record a rent payment and send a receipt',
    mins: 2,
    steps: [
      'Open Rent & bills and find the tenant.',
      'Tap “Record payment”, type the amount and choose UPI, cash or bank.',
      'For UPI, type the reference number from the payment screen.',
      'A receipt goes to the tenant on WhatsApp straight away.',
    ],
  },
  {
    id: 'h3',
    topic: 'Rent',
    title: 'How automatic WhatsApp reminders work',
    mins: 2,
    steps: [
      'Go to Settings → Reminders and switch on automatic reminders.',
      'Choose how many days before the due day the first reminder goes.',
      'Pick WhatsApp, SMS or email. Reminders stop as soon as the rent is paid.',
    ],
  },
  {
    id: 'h4',
    topic: 'Tenants',
    title: 'Check in a new tenant with ID proof',
    mins: 4,
    steps: [
      'Tap “Add tenant” and pick a vacant bed.',
      'Add their phone, emergency contact and ID proof photo.',
      'Record the deposit and send the agreement for signing.',
    ],
  },
  {
    id: 'h5',
    topic: 'Team',
    title: 'Give your caretaker access without money',
    mins: 2,
    steps: [
      'Open Team & access and tap “Invite person”.',
      'Choose the Caretaker role – they handle complaints, notices and check-ins.',
      'Caretakers never see rent, payments or expenses unless you tick those boxes.',
    ],
  },
  {
    id: 'h6',
    topic: 'Listing',
    title: 'Publish your PG online and get enquiries',
    mins: 3,
    steps: [
      'Verify your identity and your property first.',
      'Open Online listing, add photos and choose which beds to show.',
      'Enquiries come into the Enquiries page with the person’s phone number.',
    ],
  },
]

const VIDEOS = [
  { title: 'PG Manager in 5 minutes', len: '5:12', hue: 220 },
  { title: 'Adding a whole floor of rooms', len: '2:40', hue: 160 },
  { title: 'Month-end: rent, expenses and profit', len: '6:05', hue: 30 },
]

const SHORTCUTS = [
  ['Ctrl + K', 'Search tenants'],
  ['Esc', 'Close a panel or dialog'],
  ['Tab / Shift + Tab', 'Move between fields'],
]

export function HelpPage() {
  useBreadcrumbs([{ label: 'Help & support' }])
  const business = useDb((db) => db.business)
  const [q, setQ] = useState('')
  const [article, setArticle] = useState<(typeof ARTICLES)[number] | null>(null)
  const [video, setVideo] = useState<(typeof VIDEOS)[number] | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [t, setT] = useState({
    subject: '',
    topic: 'Rent & payments',
    priority: 'medium' as Priority,
    text: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const term = q.trim().toLowerCase()
  const found = ARTICLES.filter(
    (a) => !term || `${a.title} ${a.topic} ${a.steps.join(' ')}`.toLowerCase().includes(term),
  )

  function sendTicket() {
    const e: Record<string, string> = {}
    if (t.subject.trim().length < 5)
      e.subject = 'Write a short title, like “Reminders not going to tenants”'
    if (t.text.trim().length < 15)
      e.text = 'Tell us a little more – what you tried and what happened'
    setErrors(e)
    if (Object.keys(e).length) return
    const number = `#${4800 + Math.floor(t.subject.length * 7)}`
    updateDb((db) => {
      db.supportTickets.unshift({
        id: newId('st'),
        business: db.business.name,
        subject: t.subject.trim(),
        priority: t.priority,
        status: 'open',
        openedOn: TODAY,
      })
    })
    toast.success(`Ticket ${number} sent`, {
      description: `We usually reply within 4 working hours on WhatsApp and at ${business.email}.`,
    })
    setTicketOpen(false)
    setT({ subject: '', topic: 'Rent & payments', priority: 'medium', text: '' })
  }

  return (
    <div>
      <PageHeader
        title="Help & support"
        description="Answers, short videos and real people in Bengaluru to help you."
      />

      <div className="mb-8 rounded-2xl bg-gradient-to-br from-accent to-card p-6 sm:p-8">
        <h2 className="text-lg font-semibold">How can we help?</h2>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search help, like “late fee” or “caretaker”"
          className="mt-3 max-w-xl"
        />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-semibold">
          {term ? `${found.length} results` : 'Popular articles'}
        </h2>
        {found.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title="No article matches"
            actions={<Button onClick={() => setTicketOpen(true)}>Ask our team</Button>}
          >
            Try other words, or ask us – we reply within a few hours.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {found.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setArticle(a)}
                className="group flex flex-col rounded-xl border bg-card p-4 text-left shadow-xs transition hover:border-primary/40 hover:shadow-sm"
              >
                <Badge className="self-start">{a.topic}</Badge>
                <p className="mt-2 flex-1 font-medium">{a.title}</p>
                <p className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  {a.mins} min read
                  <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-semibold">Video guides</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {VIDEOS.map((v) => (
            <button
              key={v.title}
              type="button"
              onClick={() => setVideo(v)}
              className="group overflow-hidden rounded-xl border bg-card text-left shadow-xs"
            >
              <div
                className="relative flex aspect-video items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, oklch(0.8 0.08 ${v.hue}), oklch(0.55 0.12 ${v.hue + 30}))`,
                }}
              >
                <PlayCircle className="size-12 text-white/90 transition-transform group-hover:scale-110" />
                <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 text-[11px] text-white">
                  {v.len}
                </span>
              </div>
              <p className="p-3 text-sm font-medium">{v.title}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section
          title="Talk to us"
          description="Monday to Saturday, 9 am – 8 pm. Kannada, English, Hindi, Tamil and Telugu."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <a
              href="https://wa.me/918045678900"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border p-4 hover:bg-secondary/60"
            >
              <MessageCircle className="size-5 text-emerald-600" />
              <p className="mt-2 text-sm font-medium">WhatsApp</p>
              <p className="text-xs text-muted-foreground">Fastest · +91 80456 78900</p>
            </a>
            <a
              href="mailto:support@pgmanager.in"
              className="rounded-lg border p-4 hover:bg-secondary/60"
            >
              <Mail className="size-5 text-primary" />
              <p className="mt-2 text-sm font-medium">Email</p>
              <p className="text-xs text-muted-foreground">support@pgmanager.in</p>
            </a>
            <a href="tel:+918045678900" className="rounded-lg border p-4 hover:bg-secondary/60">
              <Phone className="size-5 text-slate-700" />
              <p className="mt-2 text-sm font-medium">Call</p>
              <p className="text-xs text-muted-foreground">080 4567 8900</p>
            </a>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/60 p-4">
            <div className="flex items-center gap-3">
              <Ticket className="size-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Something not working?</p>
                <p className="text-xs text-muted-foreground">
                  Raise a ticket and we track it until it’s fixed.
                </p>
              </div>
            </div>
            <Button onClick={() => setTicketOpen(true)}>
              <LifeBuoy /> Raise a ticket
            </Button>
          </div>
        </Section>
        <Section
          title={
            <span className="flex items-center gap-2">
              <Keyboard className="size-4" /> Keyboard shortcuts
            </span>
          }
          description="On a computer"
        >
          <dl className="grid gap-2 text-sm">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{v}</dt>
                <dd>
                  <kbd className="rounded border bg-secondary px-1.5 py-0.5 font-mono text-xs">
                    {k}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <Dialog
        open={!!article}
        onOpenChange={(o) => !o && setArticle(null)}
        title={article?.title ?? ''}
        description={article ? `${article.topic} · ${article.mins} min read` : undefined}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                toast.success('Thanks for telling us')
                setArticle(null)
              }}
            >
              Not helpful
            </Button>
            <Button
              onClick={() => {
                toast.success('Glad it helped!')
                setArticle(null)
              }}
            >
              This helped
            </Button>
          </>
        }
      >
        <ol className="grid list-decimal gap-3 pl-5 text-sm leading-relaxed">
          {article?.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Dialog>

      <Dialog
        open={!!video}
        onOpenChange={(o) => !o && setVideo(null)}
        title={video?.title ?? ''}
        description={video ? `Video · ${video.len}` : undefined}
      >
        {video && (
          <div
            className="flex aspect-video flex-col items-center justify-center rounded-lg text-white"
            style={{
              background: `linear-gradient(135deg, oklch(0.6 0.1 ${video.hue}), oklch(0.35 0.1 ${video.hue + 30}))`,
            }}
          >
            <PlayCircle className="size-14" />
            <p className="mt-2 text-sm">Video player (placeholder in the prototype)</p>
          </div>
        )}
      </Dialog>

      <Dialog
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        variant="side"
        title="Raise a ticket"
        description="Tell us what’s wrong. Screenshots help – you can send them on WhatsApp after."
        footer={
          <>
            <Button variant="outline" onClick={() => setTicketOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendTicket}>Send ticket</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Title" required error={errors.subject}>
            <Input
              value={t.subject}
              onChange={(e) => setT({ ...t, subject: e.target.value })}
              placeholder="Reminders not going to tenants"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="About">
              <NativeSelect value={t.topic} onChange={(e) => setT({ ...t, topic: e.target.value })}>
                {[
                  'Rent & payments',
                  'Reminders',
                  'Tenants',
                  'Rooms & beds',
                  'Team access',
                  'Plan & billing',
                  'Something else',
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="How urgent?">
              <NativeSelect
                value={t.priority}
                onChange={(e) => setT({ ...t, priority: e.target.value as Priority })}
              >
                <option value="low">Low – a question</option>
                <option value="medium">Medium – it’s slowing me down</option>
                <option value="high">High – I can’t do my work</option>
                <option value="urgent">Urgent – money or tenant data at risk</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="What happened?" required error={errors.text}>
            <Textarea
              rows={6}
              value={t.text}
              onChange={(e) => setT({ ...t, text: e.target.value })}
              placeholder="What you tried, what you expected and what you saw."
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            We’ll reply on WhatsApp at {business.phone} and by email at {business.email}.
          </p>
        </div>
      </Dialog>
    </div>
  )
}
