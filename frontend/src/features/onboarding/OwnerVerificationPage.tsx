import { Download, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'

import { ApiError, api, downloadFile } from '../../api/client'
import { useApi, useApiMutation } from '../../api/hooks'
import type { components } from '../../api/schema'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { Alert, ErrorAlert, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { formatDate } from '../../lib/format'

type OwnerCheck = components['schemas']['OwnerCheck']

const PATH = '/onboarding/owner-check'
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

const ID_TYPES = [
  { value: 'pan', label: 'PAN card' },
  { value: 'aadhaar', label: 'Aadhaar (cover the first 8 digits)' },
  { value: 'passport', label: 'Passport' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'voter_id', label: 'Voter ID' },
]

const FILE_KINDS = [
  { value: 'id_front', label: 'ID, front' },
  { value: 'id_back', label: 'ID, back' },
  { value: 'business_registration', label: 'Business registration (GST, shop licence)' },
  { value: 'other', label: 'Other' },
]

const OWNER_CHECK_TONE: Record<string, 'neutral' | 'info' | 'good' | 'warn' | 'bad'> = {
  not_started: 'neutral',
  draft: 'neutral',
  submitted: 'info',
  under_review: 'info',
  more_info: 'warn',
  approved: 'good',
  rejected: 'bad',
}

function Details({ check }: { check: OwnerCheck }) {
  const [values, setValues] = useState({
    id_type: check.id_type,
    id_last4: check.id_last4,
    name_on_id: check.name_on_id,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useApiMutation((v: typeof values) => api.patch<OwnerCheck>(PATH, v), [PATH])
  const locked = !check.can_edit

  function onSave() {
    setErrors({})
    save.mutate(values, {
      onSuccess: () => toast.success('Saved'),
      onError: (e) => {
        if (!(e instanceof ApiError)) return
        const found: Record<string, string> = {}
        for (const k of ['id_type', 'id_last4', 'name_on_id']) {
          const m = e.fieldError(k)
          if (m) found[k] = m
        }
        setErrors(found)
      },
    })
  }

  return (
    <Card>
      <CardHeader
        title="Your ID"
        description="We only keep the last 4 characters of the ID number. Never send your full Aadhaar number or any OTP."
      />
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Type of ID" required error={errors.id_type}>
          <NativeSelect
            value={values.id_type}
            disabled={locked}
            onChange={(e) =>
              setValues({ ...values, id_type: e.target.value as OwnerCheck['id_type'] })
            }
          >
            <option value="">Choose…</option>
            {ID_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Last 4 characters of the ID number" required error={errors.id_last4}>
          <Input
            value={values.id_last4}
            maxLength={4}
            disabled={locked}
            onChange={(e) => setValues({ ...values, id_last4: e.target.value })}
          />
        </Field>
        <Field label="Your name as printed on the ID" required error={errors.name_on_id}>
          <Input
            value={values.name_on_id}
            disabled={locked}
            onChange={(e) => setValues({ ...values, name_on_id: e.target.value })}
          />
        </Field>
        {!locked && (
          <div className="flex items-end">
            <Button variant="outline" busy={save.isPending} onClick={onSave}>
              Save details
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Files({ check }: { check: OwnerCheck }) {
  const [kind, setKind] = useState('id_front')
  const [error, setError] = useState<string | null>(null)
  const add = useApiMutation(
    (file: File) => {
      const body = new FormData()
      body.append('kind', kind)
      body.append('file', file)
      return api.upload(`${PATH}/documents`, body)
    },
    [PATH],
  )
  const remove = useApiMutation(
    (id: string) => api.delete(`${PATH}/documents/${id}`),
    [PATH],
    () => toast.success('File removed'),
  )

  function onPick(file: File | undefined) {
    setError(null)
    if (!file) return
    if (file.size > MAX_BYTES) return setError('Files must be 5 MB or smaller.')
    add.mutate(file, {
      onSuccess: () => toast.success('File uploaded'),
      onError: (e) =>
        setError(e instanceof ApiError ? (e.fieldError('file') ?? e.message) : 'Upload failed.'),
    })
  }

  return (
    <Card>
      <CardHeader
        title="Photos or scans"
        description="PDF, JPG, PNG or WebP, up to 5 MB each. Private: only you and the PG Manager checking team can open them."
      />
      <CardContent className="grid gap-4">
        {check.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet. Add the front of your ID.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {check.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-medium">{doc.kind_label}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {doc.file_name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Download ${doc.file_name}`}
                  onClick={() =>
                    void downloadFile(`${PATH}/documents/${doc.id}/download`, doc.file_name)
                  }
                >
                  <Download className="size-4" />
                </Button>
                {check.can_edit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${doc.file_name}`}
                    busy={remove.isPending && remove.variables === doc.id}
                    onClick={() => remove.mutate(doc.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {check.can_edit && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="What is this file?">
              <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)}>
                {FILE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              <Upload className="size-4" />
              {add.isPending ? 'Uploading…' : 'Choose a file'}
              <input
                type="file"
                accept={ACCEPT}
                className="sr-only"
                aria-label="Upload a file"
                onChange={(e) => {
                  onPick(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

export function OwnerVerificationPage() {
  const query = useApi<OwnerCheck>(PATH)
  const send = useApiMutation(() => api.post<OwnerCheck>(`${PATH}/submit`, {}), [PATH])
  const check = query.data

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <PageHeader
        title="Verify your identity"
        description="Optional. You can use the whole app while this is checked. It is only needed before your PG can be shown publicly."
      />
      {query.isLoading && <Skeleton className="h-40" />}
      {query.error && <ErrorAlert error={query.error} />}
      {check && (
        <>
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-muted-foreground" />
            <span className="text-sm">Status:</span>
            <Badge tone={OWNER_CHECK_TONE[check.status]}>{check.status_label}</Badge>
            {check.submitted_at && (
              <span className="text-sm text-muted-foreground">
                Sent {formatDate(check.submitted_at)}
              </span>
            )}
          </div>
          {check.status === 'more_info' && check.reviewer_note && (
            <Alert tone="warn" title="More information needed">
              {check.reviewer_note}
            </Alert>
          )}
          {check.status === 'rejected' && (
            <Alert tone="bad" title="Not approved">
              {check.reviewer_note || 'Contact PG Manager support for help.'}
            </Alert>
          )}
          {check.status === 'approved' && (
            <Alert tone="good" title="Verified">
              Your identity was checked by the PG Manager team.
            </Alert>
          )}
          <Details
            key={`${check.status}-${check.id_type}-${check.id_last4}-${check.name_on_id}`}
            check={check}
          />
          <Files check={check} />
          {check.can_edit && (
            <Card>
              <CardContent className="grid gap-3 pt-4">
                {check.missing.length > 0 ? (
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {check.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm">Everything is ready. Send it to the PG Manager team.</p>
                )}
                {send.error && <ErrorAlert error={send.error} />}
                <div>
                  <Button
                    disabled={check.missing.length > 0}
                    busy={send.isPending}
                    onClick={() =>
                      send.mutate(undefined, {
                        onSuccess: () => toast.success('Sent for checking'),
                      })
                    }
                  >
                    Send for checking
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {check.events.length > 0 && (
            <Card>
              <CardHeader title="History" />
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {check.events.map((e) => (
                    <li key={e.created_at} className="flex flex-wrap gap-2">
                      <span className="text-muted-foreground">{formatDate(e.created_at)}</span>
                      <span className="font-medium">{e.status_label}</span>
                      {e.note && <span>{e.note}</span>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
