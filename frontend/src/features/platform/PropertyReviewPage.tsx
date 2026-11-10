import {
  Building2,
  Check,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  History,
  MapPin,
  MessageSquareWarning,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { api, downloadFile } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import type { components } from '../../api/schema'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { Checkbox } from '../../components/ui-kit/checkbox'
import { EmptyState, ErrorAlert, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { cn } from '../../lib/cn'
import { formatDate, relativeTime } from '../../lib/format'
import { googleMapsLink } from '../../lib/location'
import { EXPIRY_TONE, VERIFICATION_TONE, fileSize } from '../properties/labels'
import { BackLink, InlineEmpty, LogoTile, PageSkeleton, TimelineItem } from './parts'
import { VerificationBadge } from './PropertiesPage'
import type { PlatformPropertyDetail } from './types'
import { PLATFORM_QUERIES } from './types'

type Decision = 'verified' | 'changes_requested' | 'rejected'
type PropertyDocument = components['schemas']['PropertyDocument']

/** What a reviewer looks at before deciding. A reminder for the reviewer only; nothing is saved. */
const CHECKS = [
  'The proof is for this address',
  'The name on the proof matches the business or its owner',
  'The document is clear, complete and in date',
]

function DocumentRow({ d, canOpen }: { d: PropertyDocument; canOpen: boolean }) {
  const isImage = d.content_type?.startsWith('image/')
  const Icon = isImage ? FileImage : FileText
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg border',
            d.is_proof
              ? 'border-sky-600/15 bg-sky-50 text-sky-700'
              : 'bg-secondary text-muted-foreground',
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-medium">
            {d.display_title} {d.is_proof && <Badge tone="info">Proof</Badge>}
          </p>
          <p className="mt-0.5 text-xs break-words text-muted-foreground">
            {d.kind_label} · {d.file_name} · {fileSize(d.size_bytes)} · uploaded{' '}
            {formatDate(d.created_at.slice(0, 10))}
          </p>
          {d.note && (
            <p className="mt-1.5 rounded-md bg-secondary/70 px-2.5 py-1.5 text-xs text-secondary-foreground">
              {d.note}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 pl-[52px] sm:justify-end sm:pl-0">
        <Badge tone={EXPIRY_TONE[d.expiry as keyof typeof EXPIRY_TONE] ?? 'neutral'} dot>
          {d.expiry_label}
        </Badge>
        <Button
          size="sm"
          variant="outline"
          disabled={!canOpen}
          onClick={() =>
            void downloadFile(`/platform/documents/${d.id}/download`, d.file_name).catch(
              (e: Error) => toast.error(e.message),
            )
          }
        >
          <Download /> Open
        </Button>
      </div>
    </li>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-medium break-words">{children}</dd>
    </div>
  )
}

export function PropertyReviewPage() {
  const { canPlatform } = useAuth()
  const { id = '' } = useParams()
  const property = useApi<PlatformPropertyDetail>(`/platform/properties/${id}/`)
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const decide = useApiMutation(
    (decision: Decision) =>
      api.post<PlatformPropertyDetail>(`/platform/properties/${id}/verification/`, {
        decision,
        note,
      }),
    PLATFORM_QUERIES,
    (p) => {
      toast.success(`${p.name}: ${p.verification_status_label}`)
      setNote('')
    },
  )
  useBreadcrumbs([
    { label: 'Verification queue', to: '/platform/verification' },
    { label: property.data?.name ?? '…' },
  ])
  if (property.isLoading) return <PageSkeleton kpis={0} />
  if (!property.data)
    return (
      <EmptyState
        icon={<Building2 />}
        title="Property not found"
        actions={
          <Button variant="outline" asChild>
            <Link to="/platform/verification">Back to the verification queue</Link>
          </Button>
        }
      >
        It may have been removed, or the link is wrong.
      </EmptyState>
    )
  const p = property.data
  const proofs = p.documents.filter((d) => d.is_proof)
  const address = [p.address_line, p.locality, p.city, p.pincode].filter(Boolean).join(', ')
  const reviewer = canPlatform('p.verification.review')
  const canOpen = canPlatform('p.documents.download')

  return (
    <>
      <PageHeader
        eyebrow={<BackLink to="/platform/verification">Verification queue</BackLink>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <LogoTile src={p.logo_url} icon={<Building2 />} />
            <span className="min-w-0 break-words">{p.name}</span>
            <VerificationBadge p={p} />
          </span>
        }
        description={
          <span>
            <Link
              to={`/platform/businesses/${p.organization_id}`}
              className="font-medium text-primary no-underline hover:underline"
            >
              {p.organization_name}
            </Link>{' '}
            · {p.property_type_label}
            {p.reference ? ` · ${p.reference}` : ''}
            {p.submitted_at && p.verification_status === 'submitted'
              ? ` · sent ${relativeTime(p.submitted_at)}`
              : ''}
          </span>
        }
      />
      <div
        className={cn(
          'grid grid-cols-1 items-start gap-5',
          reviewer && 'lg:grid-cols-[minmax(0,1fr)_360px]',
        )}
      >
        <div className="grid min-w-0 content-start gap-5">
          <Card className="overflow-hidden">
            <CardHeader
              title="Documents"
              description={
                proofs.length
                  ? `${proofs.length} proof document${proofs.length === 1 ? '' : 's'}. Opening one is recorded in the business's activity log.`
                  : 'No proof document uploaded yet.'
              }
              actions={
                p.documents.length > 0 && (
                  <Badge tone="neutral" className="tabular-nums">
                    {p.documents.length} in all
                  </Badge>
                )
              }
            />
            {p.documents.length === 0 ? (
              <CardContent>
                <InlineEmpty icon={<FileText />}>No documents.</InlineEmpty>
              </CardContent>
            ) : (
              <ul className="divide-y border-t">
                {[...proofs, ...p.documents.filter((d) => !d.is_proof)].map((d) => (
                  <DocumentRow key={d.id} d={d} canOpen={canOpen} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Property details" description="Compare these with the proof." />
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Fact label="Business">
                  <Link
                    to={`/platform/businesses/${p.organization_id}`}
                    className="text-primary no-underline hover:underline"
                  >
                    {p.organization_name}
                  </Link>
                </Fact>
                <Fact label="Type">{p.property_type_label}</Fact>
                <Fact label="Address">
                  <span className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-subtle-foreground" />
                    <span>
                      {address || '—'}
                      {p.latitude && p.longitude && (
                        <a
                          href={googleMapsLink({ latitude: p.latitude, longitude: p.longitude })}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-[13px] text-primary no-underline hover:underline"
                        >
                          Map <ExternalLink className="size-3" />
                        </a>
                      )}
                    </span>
                  </span>
                </Fact>
                <Fact label="Status">{p.status_label}</Fact>
                {p.reference && <Fact label="Reference">{p.reference}</Fact>}
                {p.contact_phone && <Fact label="Contact phone">{p.contact_phone}</Fact>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardContent>
              {p.history.length === 0 ? (
                <InlineEmpty icon={<History />}>Never sent for verification.</InlineEmpty>
              ) : (
                <ol>
                  {p.history.map((e, i) => (
                    <TimelineItem
                      key={e.id}
                      last={i === p.history.length - 1}
                      tone={VERIFICATION_TONE[e.status]}
                      title={e.status_label}
                      meta={`${e.by} · ${formatDate(e.created_at.slice(0, 10))}`}
                      note={e.note || undefined}
                    />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {reviewer && (
          <Card className="lg:sticky lg:top-20">
            <CardHeader
              title="Decision"
              description="The owner sees your note on their property page."
            />
            <CardContent className="grid gap-5">
              <div className="rounded-lg border bg-secondary/40 p-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <ShieldCheck className="size-4 text-primary" /> What to check
                  </p>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {checked.size} of {CHECKS.length}
                  </span>
                </div>
                <ul className="grid gap-2">
                  {CHECKS.map((c, i) => (
                    <li key={c}>
                      <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                        <Checkbox
                          className="mt-0.5"
                          checked={checked.has(i)}
                          onCheckedChange={(v) => {
                            const next = new Set(checked)
                            if (v === true) next.add(i)
                            else next.delete(i)
                            setChecked(next)
                          }}
                        />
                        <span
                          className={cn(checked.has(i) && 'text-muted-foreground line-through')}
                        >
                          {c}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <Field
                label="Note to the owner"
                hint="Needed when asking for changes or not approving."
              >
                <Textarea
                  rows={4}
                  value={note}
                  placeholder="For example: page 2 of the sale deed is missing."
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <ErrorAlert error={decide.error} fields={[]} />
              <div className="grid gap-2">
                <Button
                  size="lg"
                  busy={decide.isPending && decide.variables === 'verified'}
                  onClick={() => decide.mutate('verified')}
                >
                  <Check /> Verify property
                </Button>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Button
                    variant="outline"
                    disabled={!note.trim()}
                    onClick={() => decide.mutate('changes_requested')}
                  >
                    <MessageSquareWarning /> Ask for changes
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:border-red-300 hover:bg-red-50"
                    disabled={!note.trim()}
                    onClick={() => decide.mutate('rejected')}
                  >
                    <X /> Do not approve
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
