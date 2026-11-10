/** Owner identity check: ID type, last 4 characters, name on ID, photos of the ID. */
import { Check, CircleAlert, FileImage, Lock, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { NoAccess, Section, Status } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { ChoiceCards } from '../../components/ui-kit/choice-cards'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Alert, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { OWNER_CHECK } from '../../data/selectors'
import { logActivity, updateDb, useDb } from '../../data/store'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { idHistoryStore } from './util'

type IdType = 'pan' | 'aadhaar' | 'passport' | 'dl' | 'voter'

const ID_TYPES: {
  value: IdType
  label: string
  description: string
  needsBack: boolean
  example: string
  pattern: RegExp
}[] = [
  {
    value: 'pan',
    label: 'PAN card',
    description: 'Fastest. Front side only.',
    needsBack: false,
    example: 'ABCDE1234F → 234F',
    pattern: /^[0-9]{3}[A-Z]$/,
  },
  {
    value: 'aadhaar',
    label: 'Aadhaar (masked)',
    description: 'Cover the first 8 digits before taking the photo.',
    needsBack: true,
    example: 'XXXX XXXX 1234 → 1234',
    pattern: /^\d{4}$/,
  },
  {
    value: 'passport',
    label: 'Passport',
    description: 'The photo page.',
    needsBack: false,
    example: 'K1234567 → 4567',
    pattern: /^[A-Z0-9]{4}$/,
  },
  {
    value: 'dl',
    label: 'Driving licence',
    description: 'Front and back.',
    needsBack: true,
    example: 'KA0120190001234 → 1234',
    pattern: /^[A-Z0-9]{4}$/,
  },
  {
    value: 'voter',
    label: 'Voter ID',
    description: 'Front and back.',
    needsBack: true,
    example: 'ABC1234567 → 4567',
    pattern: /^[A-Z0-9]{4}$/,
  },
]

type Slot = 'front' | 'back' | 'business'
interface FakeFile {
  name: string
  size: string
}

export function VerifyIdentityPage() {
  useBreadcrumbs([
    { label: 'Get started', to: '/app/get-started' },
    { label: 'Verify your identity' },
  ])
  const navigate = useNavigate()
  const { role, person } = useSession()
  const business = useDb((db) => db.business)
  const history = idHistoryStore.use()

  const [idType, setIdType] = useState<IdType>('pan')
  const [last4, setLast4] = useState('')
  const [nameOnId, setNameOnId] = useState(business.ownerName)
  const [files, setFiles] = useState<Partial<Record<Slot, FakeFile>>>({})
  const [errors, setErrors] = useState<{ last4?: string; name?: string }>({})
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)

  if (role !== 'owner') return <NoAccess what="the owner identity check" />

  const status = business.verification
  const locked = status === 'submitted' || status === 'under_review' || status === 'approved'
  const type = ID_TYPES.find((t) => t.value === idType)!

  const missing: string[] = []
  if (!type.pattern.test(last4)) missing.push(`Last 4 characters of your ${type.label}`)
  if (nameOnId.trim().length < 3) missing.push('Your name exactly as on the ID')
  if (!files.front)
    missing.push(`Photo of the ${type.value === 'passport' ? 'photo page' : 'front'}`)
  if (type.needsBack && !files.back) missing.push('Photo of the back')

  function addFile(slot: Slot) {
    const names: Record<Slot, string> = {
      front: `${type.value}-front.jpg`,
      back: `${type.value}-back.jpg`,
      business: 'gst-certificate.pdf',
    }
    const size = { front: '1.8 MB', back: '1.6 MB', business: '412 KB' }[slot]
    setFiles((f) => ({ ...f, [slot]: { name: names[slot], size } }))
    toast.success('Photo added')
  }

  function addHistory(text: string) {
    idHistoryStore.set((h) => [
      { on: new Date().toISOString().slice(0, 19), text, by: person.name },
      ...h,
    ])
  }

  function submit() {
    const next: typeof errors = {}
    if (!type.pattern.test(last4))
      next.last4 = `Type only the last 4 characters, like ${type.example.split('→ ')[1]}`
    if (nameOnId.trim().length < 3) next.name = 'Type your name exactly as it is printed on the ID'
    setErrors(next)
    if (missing.length) {
      toast.error('A few things are missing', { description: missing.join(' · ') })
      return
    }
    updateDb((db) => {
      db.business.verification = 'submitted'
      logActivity(db, {
        by: person.name,
        kind: 'settings',
        action: `Sent the owner identity check (${type.label} ending ${last4})`,
        target: 'Identity check',
      })
    })
    addHistory(`Sent for checking: ${type.label} ending ${last4}`)
    toast.success('Sent for checking', { description: 'We usually finish within 1 working day.' })
  }

  function saveDraft() {
    updateDb((db) => {
      db.business.verification = 'draft'
    })
    addHistory('Saved a draft')
    toast.success('Draft saved')
  }

  function withdraw() {
    updateDb((db) => {
      db.business.verification = 'draft'
    })
    addHistory('Took back the check to make changes')
    setConfirmWithdraw(false)
    toast.success('You can change your details now')
  }

  const slots: { slot: Slot; label: string; hint: string; show: boolean; optional?: boolean }[] = [
    {
      slot: 'front',
      label: type.value === 'passport' ? 'Photo page' : 'ID front',
      hint: type.value === 'aadhaar' ? 'First 8 digits covered' : 'All 4 corners visible',
      show: true,
    },
    { slot: 'back', label: 'ID back', hint: 'All 4 corners visible', show: type.needsBack },
    {
      slot: 'business',
      label: 'Business registration',
      hint: 'GST, trade licence or shop licence',
      show: true,
      optional: true,
    },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Verify your identity"
        description="A quick check by the PG Manager team that you are the real owner. Needed only to publish listings online."
        actions={<Status of={OWNER_CHECK} value={status} />}
      />

      {status === 'approved' && (
        <Alert tone="good" className="mb-5" title="You are verified">
          Your listings show a “Verified owner” badge. Nothing more to do.
        </Alert>
      )}
      {(status === 'submitted' || status === 'under_review') && (
        <Alert
          tone="info"
          className="mb-5"
          title={status === 'submitted' ? 'Sent for checking' : 'Being checked'}
          actions={
            <Button
              size="sm"
              variant="outline"
              className="bg-white"
              onClick={() => setConfirmWithdraw(true)}
            >
              Make changes
            </Button>
          }
        >
          We usually finish within 1 working day and will tell you by SMS. Your details are locked
          while we check them.
        </Alert>
      )}
      {status === 'more_info' && (
        <Alert tone="warn" className="mb-5" title="We need a clearer photo">
          The photo of the ID front was blurry. Please add a new photo and send it again.
        </Alert>
      )}
      {status === 'rejected' && (
        <Alert tone="bad" className="mb-5" title="Not approved">
          The name on the ID did not match your account. Fix it below and send again, or contact
          support.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div
          className={cn('grid content-start gap-6', locked && 'pointer-events-none opacity-60')}
          aria-disabled={locked || undefined}
        >
          <Section title="1. Choose your ID">
            <ChoiceCards
              label="ID type"
              value={idType}
              onChange={(v) => {
                setIdType(v)
                setLast4('')
                setFiles((f) => ({ business: f.business }))
              }}
              choices={ID_TYPES.map((t) => ({
                value: t.value,
                label: t.label,
                description: t.description,
              }))}
            />
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-secondary px-3 py-2.5 text-[13px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              We never ask for an Aadhaar OTP, fingerprints or your full ID number. This is our own
              check, not a government verification.
            </p>
          </Section>

          <Section title="2. Details on the ID">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Last 4 characters"
                required
                error={errors.last4}
                hint={`Example: ${type.example}`}
              >
                <Input
                  value={last4}
                  maxLength={4}
                  autoComplete="off"
                  disabled={locked}
                  className="font-mono tracking-[0.3em] uppercase"
                  onChange={(e) =>
                    setLast4(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 4),
                    )
                  }
                />
              </Field>
              <Field label="Name on the ID" required error={errors.name} hint="Exactly as printed.">
                <Input
                  value={nameOnId}
                  disabled={locked}
                  onChange={(e) => setNameOnId(e.target.value)}
                />
              </Field>
            </div>
            {idType === 'aadhaar' && last4.length === 4 && (
              <p className="mt-3 text-sm">
                We will store it as{' '}
                <span className="font-mono font-semibold">XXXX XXXX {last4}</span>
              </p>
            )}
          </Section>

          <Section
            title="3. Photos"
            description="JPG, PNG or PDF up to 5 MB. Private – only our checking team can open them."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {slots
                .filter((s) => s.show)
                .map((s) => {
                  const f = files[s.slot]
                  return f ? (
                    <div key={s.slot} className="flex flex-col rounded-xl border bg-card p-3">
                      <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200">
                        <FileImage className="size-8 text-slate-400" />
                      </div>
                      <p className="mt-2 text-xs font-medium text-muted-foreground">{s.label}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</p>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${s.label}`}
                          disabled={locked}
                          onClick={() => setFiles((x) => ({ ...x, [s.slot]: undefined }))}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{f.size}</p>
                    </div>
                  ) : (
                    <button
                      key={s.slot}
                      type="button"
                      disabled={locked}
                      onClick={() => addFile(s.slot)}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-card px-3 py-6 text-center transition hover:border-primary/50 hover:bg-accent/40"
                    >
                      <Upload className="size-5 text-muted-foreground" />
                      <span className="text-sm font-medium">{s.label}</span>
                      <span className="text-xs text-muted-foreground">{s.hint}</span>
                      {s.optional && (
                        <span className="text-[11px] text-muted-foreground">(optional)</span>
                      )}
                    </button>
                  )
                })}
            </div>
          </Section>

          {!locked && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={saveDraft}>
                Save draft
              </Button>
              <Button onClick={submit}>Send for checking</Button>
            </div>
          )}
        </div>

        <aside className="grid content-start gap-6">
          <Section title="What’s missing">
            {locked ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="size-4" /> Nothing – already sent.
              </p>
            ) : missing.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <Check className="size-4" /> Ready to send
              </p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {missing.map((m) => (
                  <li key={m} className="flex gap-2">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="History">
            <ol className="relative grid gap-4 border-l pl-4">
              {history.map((h, i) => (
                <li key={`${h.on}-${i}`} className="relative">
                  <span
                    className={cn(
                      'absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-card',
                      i === 0 ? 'bg-primary' : 'bg-slate-300',
                    )}
                  />
                  <p className="text-sm">{h.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.by} · {formatDate(h.on)}
                  </p>
                </li>
              ))}
            </ol>
          </Section>

          <Button variant="ghost" onClick={() => navigate('/app/get-started')}>
            Back to Get started
          </Button>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmWithdraw}
        onOpenChange={setConfirmWithdraw}
        title="Take back your identity check?"
        confirmLabel="Take back and edit"
        onConfirm={withdraw}
      >
        We will stop checking it. You can change your details and send it again – checking starts
        again from the beginning.
      </ConfirmDialog>
    </div>
  )
}
