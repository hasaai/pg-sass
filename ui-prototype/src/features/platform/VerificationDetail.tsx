import {
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Lock,
  PlayCircle,
  RotateCw,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { DetailList, Section, Status } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { CheckboxRow } from '../../components/ui-kit/checkbox'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert, EmptyState, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { updateDb, useDb } from '../../data/store'
import type { OwnerCheckStatus, PropertyVerification, VerificationItem } from '../../data/types'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { updateExtras, useExtras } from './extras'
import type { ReviewEvent } from './extras'
import { CHECK_STATUS, PERSON_SHORT, formatDateTime, stamp, waitingLabel } from './util'

const CHECKLIST = [
  {
    key: 'name',
    label: 'Name matches',
    hint: 'The name on the document is the owner’s / business name we have.',
  },
  {
    key: 'address',
    label: 'Address is visible',
    hint: 'For a property: the address matches the listing.',
  },
  { key: 'expiry', label: 'Not expired', hint: 'The document is valid today.' },
  { key: 'photos', label: 'Photos look real', hint: 'No screenshots, edits or stock photos.' },
] as const

const OWNER_MAP: Record<VerificationItem['status'], OwnerCheckStatus> = {
  submitted: 'submitted',
  under_review: 'under_review',
  more_info: 'more_info',
  approved: 'approved',
  rejected: 'rejected',
}
const PROPERTY_MAP: Record<VerificationItem['status'], PropertyVerification> = {
  submitted: 'submitted',
  under_review: 'under_review',
  more_info: 'changes_requested',
  approved: 'verified',
  rejected: 'rejected',
}

type Decision = 'more_info' | 'rejected' | null

export function VerificationDetail() {
  const { id = '' } = useParams()
  const item = useDb((db) => db.verificationQueue.find((v) => v.id === id))
  const businesses = useDb((db) => db.platformBusinesses)
  const history = useExtras((x) => x.reviewHistory[id])
  const ticks = useExtras((x) => x.checklists[id])
  const [zoom, setZoom] = useState<string | null>(null)
  const [decision, setDecision] = useState<Decision>(null)

  useBreadcrumbs([
    { label: 'Checks', to: '/platform/verification' },
    { label: item?.subject ?? 'Not found' },
  ])

  const events: ReviewEvent[] = useMemo(
    () =>
      history ??
      (item
        ? [
            {
              on: `${item.submittedOn}T09:00:00`,
              by: item.business,
              text: 'Sent for checking.',
              tone: 'info',
            },
          ]
        : []),
    [history, item],
  )

  if (!item) {
    return (
      <EmptyState
        title="This check was not found"
        actions={
          <Button asChild variant="outline">
            <Link to="/platform/verification">Back to checks</Link>
          </Button>
        }
      />
    )
  }

  const biz = businesses.find((b) => b.name === item.business)
  const done = item.status === 'approved' || item.status === 'rejected'
  const allTicked = CHECKLIST.every((c) => ticks?.[c.key])
  const v = item
  const mask = /ending (\w+)/.exec(item.subject)?.[1]

  function decide(status: VerificationItem['status'], text: string, tone: ReviewEvent['tone']) {
    updateDb((db) => {
      db.verificationQueue = db.verificationQueue.map((x) =>
        x.id === v.id
          ? { ...x, status, assignedTo: x.assignedTo ?? `${PERSON_SHORT} (Reviewer)` }
          : x,
      )
      if (v.kind === 'owner') {
        db.platformBusinesses = db.platformBusinesses.map((b) =>
          b.name === v.business ? { ...b, ownerCheck: OWNER_MAP[status] } : b,
        )
        if (db.business.name === v.business)
          db.business = { ...db.business, verification: OWNER_MAP[status] }
      } else if (db.business.name === v.business) {
        db.properties = db.properties.map((p) =>
          p.name === v.subject ? { ...p, verification: PROPERTY_MAP[status] } : p,
        )
      }
    })
    updateExtras((x) => {
      x.reviewHistory[v.id] = [...events, { on: stamp(), by: PERSON_SHORT, text, tone }]
    })
  }

  function tick(key: string, on: boolean) {
    updateExtras((x) => {
      x.checklists[v.id] = { ...(x.checklists[v.id] ?? {}), [key]: on }
    })
  }

  const tiles = item.documents.flatMap((d) => {
    const photos = /^(\d+) photos$/.exec(d)
    if (photos) {
      return Array.from({ length: Math.min(6, Number(photos[1])) }, (_, i) => ({
        key: `${d}-${i}`,
        title: `Photo ${i + 1}`,
        photo: true,
      }))
    }
    return [{ key: d, title: d, photo: false }]
  })

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-1.5">
            <Badge tone="outline">{item.kind === 'owner' ? 'Owner ID' : 'Property'}</Badge>
            <Status of={CHECK_STATUS} value={item.status} />
          </div>
        }
        title={item.subject}
        description={
          <span>
            {biz ? (
              <Link to={`/platform/businesses/${biz.id}`} className="text-primary hover:underline">
                {item.business}
              </Link>
            ) : (
              item.business
            )}{' '}
            · {item.locality} · sent {formatDate(item.submittedOn)}
          </span>
        }
        actions={
          item.status === 'submitted' && (
            <Button
              onClick={() => {
                decide('under_review', 'Started checking.', 'info')
                toast.success('You are now checking this')
              }}
            >
              <PlayCircle /> Start checking
            </Button>
          )
        }
      />

      {item.kind === 'owner' && (
        <Alert tone="info" className="mb-5" title="Only masked ID numbers">
          We keep only the last 4 characters of the ID number. If a document shows a full Aadhaar
          number, choose “Ask for more information” and ask for a masked copy.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Section
            title="Documents"
            description="Click a document to open it larger. Every opening is written to the audit log."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {tiles.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setZoom(t.key)}
                  className="group relative overflow-hidden rounded-lg border text-left"
                >
                  <DocFace title={t.title} photo={t.photo} hue={(i * 67 + 200) % 360} mask={mask} />
                  <span className="absolute top-2 right-2 rounded-md bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100">
                    <ZoomIn className="size-4" />
                  </span>
                  <p className="truncate border-t bg-card px-2.5 py-2 text-[13px] font-medium">
                    {t.title}
                  </p>
                </button>
              ))}
            </div>
          </Section>

          <Section title="History">
            <ol className="relative grid gap-5 border-l pl-5">
              {events.map((e, i) => (
                <li key={i} className="relative">
                  <span
                    className={cn(
                      'absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-card',
                      {
                        neutral: 'bg-slate-400',
                        info: 'bg-blue-500',
                        good: 'bg-emerald-500',
                        warn: 'bg-amber-500',
                        bad: 'bg-red-500',
                      }[e.tone],
                    )}
                  />
                  <p className="text-sm">{e.text}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.by} · {formatDateTime(e.on)}
                  </p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="Reviewer checklist" description="Tick each one after you have looked.">
            <div className="grid gap-3.5">
              {CHECKLIST.map((c) => (
                <CheckboxRow
                  key={c.key}
                  label={c.label}
                  hint={c.hint}
                  checked={Boolean(ticks?.[c.key])}
                  disabled={done}
                  onCheckedChange={(on) => tick(c.key, on === true)}
                />
              ))}
            </div>
          </Section>

          <Section title="Decision">
            {done ? (
              <div className="grid gap-3">
                <Alert
                  tone={item.status === 'approved' ? 'good' : 'bad'}
                  title={CHECK_STATUS[item.status].label}
                >
                  {item.status === 'approved'
                    ? 'The owner was told and the “verified” mark is shown on their listings.'
                    : 'The owner was told why and can send new documents.'}
                </Alert>
                <Button
                  variant="outline"
                  onClick={() => {
                    decide('under_review', 'Opened again for another look.', 'neutral')
                    toast.success('Check opened again')
                  }}
                >
                  <RotateCw /> Open again
                </Button>
              </div>
            ) : (
              <div className="grid gap-2">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-600/90"
                  disabled={!allTicked}
                  onClick={() => {
                    decide('approved', 'Approved. All checklist items ticked.', 'good')
                    toast.success(`${item.kind === 'owner' ? 'Owner' : 'Property'} approved`, {
                      description: `${item.business} has been told by SMS and email.`,
                    })
                  }}
                >
                  <CheckCircle2 /> Approve
                </Button>
                {!allTicked && (
                  <p className="text-center text-xs text-muted-foreground">
                    Tick all 4 checklist items to approve.
                  </p>
                )}
                <Button variant="outline" onClick={() => setDecision('more_info')}>
                  <HelpCircle /> Ask for more information
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDecision('rejected')}
                >
                  <XCircle /> Not approved
                </Button>
                {item.status === 'submitted' && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      decide('under_review', 'Started checking.', 'info')
                      toast.success('You are now checking this')
                    }}
                  >
                    <PlayCircle /> Start checking
                  </Button>
                )}
              </div>
            )}
          </Section>

          <Section title="Details">
            <DetailList
              cols={2}
              items={[
                [
                  'Waiting',
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {waitingLabel(item)}
                  </span>,
                ],
                ['Reviewer', item.assignedTo?.replace(' (Reviewer)', '') ?? 'Nobody yet'],
                ['Business', item.business],
                ['Area', item.locality],
              ]}
            />
          </Section>
        </div>
      </div>

      <ZoomDialog
        tile={tiles.find((t) => t.key === zoom)}
        onClose={() => setZoom(null)}
        index={tiles.findIndex((t) => t.key === zoom)}
        mask={mask}
      />
      <DecisionDialog
        decision={decision}
        onClose={() => setDecision(null)}
        onConfirm={(text) => {
          if (decision === 'more_info') {
            decide('more_info', `Asked for more information: ${text}`, 'warn')
            toast.success('Owner asked for more information', {
              description: 'They can edit and send it again.',
            })
          } else {
            decide('rejected', `Not approved: ${text}`, 'bad')
            toast.success('Marked as not approved', { description: 'The owner has been told why.' })
          }
        }}
      />
    </>
  )
}

function DocFace({
  title,
  photo,
  hue,
  large,
  mask,
}: {
  title: string
  photo: boolean
  hue: number
  large?: boolean
  mask?: string
}) {
  if (photo) {
    return (
      <div
        className={cn('flex aspect-[4/3] items-center justify-center', large && 'aspect-[16/10]')}
        style={{
          background: `linear-gradient(135deg, oklch(0.86 0.06 ${hue}), oklch(0.6 0.09 ${hue + 40}))`,
        }}
      >
        <ImageIcon className={cn('text-white/80', large ? 'size-16' : 'size-8')} />
      </div>
    )
  }
  return (
    <div
      className={cn(
        'flex aspect-[4/3] flex-col gap-1.5 bg-slate-50 p-3',
        large && 'aspect-[16/10] gap-3 p-8',
      )}
    >
      <div className="flex items-center gap-1.5">
        <FileText className={cn('text-slate-400', large ? 'size-6' : 'size-4')} />
        <span className={cn('h-2 w-1/2 rounded bg-slate-300', large && 'h-3')} />
      </div>
      <span className={cn('h-1.5 w-full rounded bg-slate-200', large && 'h-2.5')} />
      <span className={cn('h-1.5 w-4/5 rounded bg-slate-200', large && 'h-2.5')} />
      <span className={cn('h-1.5 w-11/12 rounded bg-slate-200', large && 'h-2.5')} />
      <span className={cn('h-1.5 w-2/3 rounded bg-slate-200', large && 'h-2.5')} />
      <div className="mt-auto flex items-center justify-between">
        <span className={cn('h-1.5 w-1/3 rounded bg-slate-200', large && 'h-2.5')} />
        <span className="text-[10px] font-medium text-slate-400">
          {mask && /Aadhaar|PAN|Passport/.test(title) ? `XXXX XXXX ${mask}` : ''}
        </span>
      </div>
    </div>
  )
}

function ZoomDialog({
  tile,
  onClose,
  index,
  mask,
}: {
  tile?: { key: string; title: string; photo: boolean }
  onClose: () => void
  index: number
  mask?: string
}) {
  const [scale, setScale] = useState(1)
  return (
    <Dialog
      open={Boolean(tile)}
      onOpenChange={(o) => {
        if (!o) {
          setScale(1)
          onClose()
        }
      }}
      title={tile?.title ?? ''}
      description="Private document · opened by you, written to the audit log"
      className="max-w-3xl"
      footer={
        <>
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            onClick={() => setScale((s) => Math.max(1, s - 0.5))}
          >
            <ZoomOut />
          </Button>
          <span className="flex items-center px-2 text-sm tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            onClick={() => setScale((s) => Math.min(3, s + 0.5))}
          >
            <ZoomIn />
          </Button>
        </>
      }
    >
      {tile && (
        <div className="overflow-auto rounded-lg border">
          <div
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: `${100}%` }}
          >
            <DocFace
              title={tile.title}
              photo={tile.photo}
              hue={(index * 67 + 200) % 360}
              large
              mask={mask}
            />
          </div>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5" /> Do not download or share outside the review.
      </p>
    </Dialog>
  )
}

function DecisionDialog({
  decision,
  onClose,
  onConfirm,
}: {
  decision: Decision
  onClose: () => void
  onConfirm: (text: string) => void
}) {
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const more = decision === 'more_info'
  const error =
    tried && !text.trim()
      ? more
        ? 'Write what the owner should send or fix.'
        : 'Write why it is not approved.'
      : undefined
  function close() {
    setText('')
    setTried(false)
    onClose()
  }
  const quick = more
    ? [
        'Photo is blurred – please upload a clear copy.',
        'Please upload a masked Aadhaar (only last 4 digits visible).',
        'The address on the bill does not match the listing.',
      ]
    : [
        'Name on the document does not match the owner.',
        'The document has expired.',
        'Photos are not of this property.',
      ]
  return (
    <Dialog
      open={decision !== null}
      onOpenChange={(o) => !o && close()}
      title={more ? 'Ask for more information' : 'Not approved'}
      description={
        more
          ? 'The owner sees this note and can send again.'
          : 'The owner sees this reason. They can send new documents later.'
      }
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={more ? 'default' : 'destructive'}
            onClick={() => {
              setTried(true)
              if (!text.trim()) return
              onConfirm(text.trim())
              close()
            }}
          >
            {more ? 'Send to owner' : 'Mark as not approved'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label={more ? 'Note for the owner' : 'Reason'} required error={error}>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setText(q)}
              className="rounded-full border bg-card px-3 py-1 text-left text-xs hover:bg-secondary"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
