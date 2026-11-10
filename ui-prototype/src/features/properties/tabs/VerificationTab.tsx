import {
  Check,
  CheckCircle2,
  Circle,
  FileText,
  ImageIcon,
  MapPin,
  MessageSquare,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react'

import { Section, Status } from '../../../components/common'
import { Button } from '../../../components/ui-kit/button'
import { Alert } from '../../../components/ui-kit/feedback'
import { VERIFICATION } from '../../../data/selectors'
import type { Property } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { cn } from '../../../lib/cn'
import { formatDate } from '../../../lib/format'
import { sendForChecking } from '../actions'
import { extra } from '../lib'
import type { TabKey } from '../PropertyDetail'

const STEPS = ['Not checked yet', 'Sent', 'Being checked', 'Verified']

const CHECKS = [
  {
    icon: <MapPin />,
    title: 'The address is real',
    text: 'The pin on the map and the electricity bill match the address.',
  },
  {
    icon: <FileText />,
    title: 'You can run a PG here',
    text: 'Rental agreement with the building owner or ownership papers, and the trade licence.',
  },
  {
    icon: <ImageIcon />,
    title: 'Photos are of this place',
    text: 'At least 3 recent photos of rooms, bathroom and common areas.',
  },
  {
    icon: <User />,
    title: 'The owner is who they say',
    text: 'Your own identity check (done once for the business).',
  },
]

const NEEDED = [
  'Rental agreement with building owner',
  'Property ownership papers',
  'Trade licence',
  'Electricity bill',
]

function defaultNotes(p: Property) {
  switch (p.verification) {
    case 'verified':
      return [
        {
          on: '2025-04-18',
          by: 'PG Manager team',
          text: 'All documents matched the address. The property is verified and shows the Verified badge on your listing.',
        },
      ]
    case 'under_review':
      return [
        { on: '2026-10-28', by: 'Asha Rao', text: 'Sent for checking with 2 documents.' },
        {
          on: '2026-10-30',
          by: 'Meena (PG Manager team)',
          text: 'Started checking. We may call the contact number to confirm the address.',
        },
      ]
    case 'changes_requested':
      return [
        {
          on: '2026-10-25',
          by: 'PG Manager team',
          text: 'The trade licence photo is not clear. Please upload a clear copy and send again.',
        },
      ]
    case 'rejected':
      return [
        {
          on: '2026-10-25',
          by: 'PG Manager team',
          text: 'The documents are for a different address. Upload documents for this building and send again.',
        },
      ]
    default:
      return []
  }
}

export function VerificationTab({
  property: p,
  goTo,
}: {
  property: Property
  goTo: (t: TabKey) => void
}) {
  const { can } = useSession()
  const manage = can('properties.manage')
  const at = {
    unverified: 0,
    submitted: 1,
    under_review: 2,
    changes_requested: 2,
    rejected: 2,
    verified: 3,
  }[p.verification]
  const problem = p.verification === 'changes_requested' || p.verification === 'rejected'
  const notes = [...defaultNotes(p), ...(extra(p).verificationLog ?? [])]
  const hasProof = p.documents.some((d) => NEEDED.slice(0, 2).includes(d.kind))
  const canSend = ['unverified', 'changes_requested', 'rejected'].includes(p.verification)
  const missing = [
    !hasProof && 'rental agreement or ownership papers',
    p.photos.length < 3 && 'at least 3 photos',
  ].filter(Boolean) as string[]

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-5">
        <Section
          title="Verification"
          description="A Verified badge tells tenants this place is real and checked."
          actions={<Status of={VERIFICATION} value={p.verification} />}
        >
          <ol className="grid gap-0 sm:grid-cols-4">
            {STEPS.map((s, i) => {
              const done = i < at || (i === at && p.verification === 'verified')
              const current = i === at && !done
              return (
                <li
                  key={s}
                  className="relative flex gap-3 pb-5 sm:flex-col sm:items-center sm:pb-0 sm:text-center"
                >
                  {i < STEPS.length - 1 && (
                    <span
                      className={cn(
                        'absolute top-7 left-3.5 h-[calc(100%-1.75rem)] w-0.5 sm:top-3.5 sm:left-[calc(50%+1rem)] sm:h-0.5 sm:w-[calc(100%-2rem)]',
                        i < at ? 'bg-emerald-500' : 'bg-border',
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 bg-card',
                      done && 'border-emerald-500 bg-emerald-500 text-white',
                      current && !problem && 'border-primary text-primary',
                      current && problem && 'border-amber-500 text-amber-600',
                    )}
                  >
                    {done ? (
                      <Check className="size-4" strokeWidth={3} />
                    ) : current && problem ? (
                      <XCircle className="size-4" />
                    ) : (
                      <Circle
                        className={cn('size-2.5', current ? 'fill-current' : 'text-border')}
                      />
                    )}
                  </span>
                  <span className="sm:mt-2">
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        !done && !current && 'text-muted-foreground',
                      )}
                    >
                      {current && problem ? VERIFICATION[p.verification].label : s}
                    </span>
                    {current && !problem && i > 0 && (
                      <span className="block text-xs text-muted-foreground">Now</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
          {problem && (
            <Alert tone="warn" className="mt-5" title="The team needs changes">
              Read the note below, fix it and send again.
            </Alert>
          )}
          {p.verification === 'verified' && (
            <Alert tone="good" className="mt-5" title="Verified">
              Changing a proof document sends the property back to “Being checked”.
            </Alert>
          )}
          {(p.verification === 'submitted' || p.verification === 'under_review') && (
            <Alert tone="info" className="mt-5" title="We’re on it">
              The PG Manager team usually replies in 1–2 working days. You can keep using everything
              as usual.
            </Alert>
          )}
        </Section>

        <Section title="What the team checks">
          <ul className="grid gap-4 sm:grid-cols-2">
            {CHECKS.map((c) => (
              <li key={c.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary [&_svg]:size-4">
                  {c.icon}
                </span>
                <span>
                  <span className="block text-sm font-medium">{c.title}</span>
                  <span className="block text-[13px] text-muted-foreground">{c.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            This is a check by the PG Manager team, not a government verification.
          </p>
        </Section>

        <Section title="Notes from the team" description="Messages about this check.">
          {notes.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              No notes yet. They appear here after you send the property for checking.
            </p>
          ) : (
            <ol className="grid gap-4">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <MessageSquare className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{n.by}</span> ·{' '}
                      {formatDate(n.on)}
                    </p>
                    <p className="mt-0.5 text-sm">{n.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      <div className="grid content-start gap-5">
        <Section title="Documents included">
          <ul className="grid gap-2.5">
            {NEEDED.map((k, i) => {
              const doc = p.documents.find((d) => d.kind === k)
              const optional =
                i === 1 ? 'or the rental agreement' : i === 0 ? 'or ownership papers' : ''
              return (
                <li key={k} className="flex items-start gap-2.5 text-[13px]">
                  {doc ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span>
                    <span className="block font-medium">{k}</span>
                    <span className="block text-xs text-muted-foreground">
                      {doc ? doc.title : optional ? `Not uploaded (${optional})` : 'Not uploaded'}
                    </span>
                  </span>
                </li>
              )
            })}
            <li className="flex items-start gap-2.5 text-[13px]">
              {p.photos.length >= 3 ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span>
                <span className="block font-medium">Photos</span>
                <span className="block text-xs text-muted-foreground">{p.photos.length} added</span>
              </span>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {can('properties.documents') && (
              <Button size="sm" variant="outline" onClick={() => goTo('documents')}>
                Documents
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => goTo('photos')}>
              Photos
            </Button>
          </div>
        </Section>

        {manage && canSend && (
          <div className="rounded-xl border-2 border-primary/30 bg-accent/50 p-5">
            <ShieldCheck className="mb-2 size-6 text-primary" />
            <p className="font-semibold">{problem ? 'Send again' : 'Get the Verified badge'}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              We send your documents and photos to the PG Manager team.
            </p>
            {missing.length > 0 && (
              <p className="mt-2 text-[13px] text-amber-800">Add {missing.join(' and ')} first.</p>
            )}
            <Button
              className="mt-3 w-full"
              disabled={missing.length > 0}
              onClick={() => sendForChecking(p)}
            >
              <ShieldCheck /> Send for checking
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
