import { zodResolver } from '@hookform/resolvers/zod'
import {
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { ApiError, api, downloadFile } from '../../../api/client'
import { useApi, useApiMutation } from '../../../api/hooks'
import type { Property, PropertyDocument, VerificationEvent } from '../../../api/types'
import { Badge } from '../../../components/ui-kit/badge'
import { Button } from '../../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../../components/ui-kit/card'
import { ConfirmDialog } from '../../../components/ui-kit/confirm'
import { Dialog } from '../../../components/ui-kit/dialog'
import { Alert, EmptyState, ErrorAlert, Skeleton } from '../../../components/ui-kit/feedback'
import { Field } from '../../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../../components/ui-kit/input'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../../components/ui-kit/menu'
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui-kit/table'
import { toast } from '../../../components/ui-kit/toast'
import { formatDate } from '../../../lib/format'
import { PROPERTY_QUERIES } from '../api'
import { DOCUMENT_KINDS, EXPIRY_TONE, VERIFICATION_TONE, fileSize } from '../labels'

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

const schema = z
  .object({
    kind: z.string().min(1, 'Choose what kind of document it is.'),
    title: z.string().trim().max(150),
    issued_on: z.string(),
    expires_on: z.string(),
    note: z.string().trim().max(500),
  })
  .refine((v) => !v.issued_on || !v.expires_on || v.expires_on >= v.issued_on, {
    path: ['expires_on'],
    message: 'The expiry date must be after the issue date.',
  })
type Values = z.infer<typeof schema>

function DocumentDialog({
  property,
  doc,
  onOpenChange,
}: {
  property: Property
  doc?: PropertyDocument
  onOpenChange: (open: boolean) => void
}) {
  const editing = Boolean(doc)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: doc?.kind ?? '',
      title: doc?.title ?? '',
      issued_on: doc?.issued_on ?? '',
      expires_on: doc?.expires_on ?? '',
      note: doc?.note ?? '',
    },
  })
  const save = useApiMutation(async (v: Values) => {
    const fields = { ...v, issued_on: v.issued_on || null, expires_on: v.expires_on || null }
    if (doc) return api.patch<PropertyDocument>(`/property-documents/${doc.id}/`, fields)
    const body = new FormData()
    body.append('file', file as File)
    for (const [k, value] of Object.entries(fields)) if (value) body.append(k, String(value))
    return api.upload<PropertyDocument>(`/properties/${property.id}/documents/`, body)
  }, PROPERTY_QUERIES)
  const err = form.formState.errors

  function onSubmit(v: Values) {
    if (!editing) {
      if (!file) return setFileError('Choose a file to upload.')
      if (file.size > MAX_BYTES) return setFileError('Files must be 5 MB or smaller.')
    }
    save.mutate(v, {
      onSuccess: (saved) => {
        toast.success(editing ? 'Document saved' : `${saved.display_title} uploaded`)
        onOpenChange(false)
      },
      onError: (e) => {
        if (e instanceof ApiError) {
          const f = e.fieldError('file')
          if (f) setFileError(f)
          for (const k of ['kind', 'title', 'issued_on', 'expires_on', 'note'] as const) {
            const m = e.fieldError(k)
            if (m) form.setError(k, { message: m })
          }
        }
      },
    })
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      variant="side"
      title={editing ? `Edit ${doc?.display_title}` : 'Upload a document'}
      description="Private: only owners and managers of your business can open it. The PG Manager team may look at proof documents to verify the property."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="doc-form" busy={save.isPending}>
            {editing ? 'Save' : 'Upload'}
          </Button>
        </>
      }
    >
      <form id="doc-form" noValidate className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        {!editing && (
          <Field
            label="File"
            required
            hint="PDF, JPG, PNG or WebP, up to 5 MB."
            error={fileError ?? undefined}
          >
            <Input
              type="file"
              accept={ACCEPT}
              className="h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-[13px]"
              onChange={(e) => {
                setFileError(null)
                setFile(e.target.files?.[0] ?? null)
              }}
            />
          </Field>
        )}
        <Field label="What is it?" required error={err.kind?.message}>
          <NativeSelect {...form.register('kind')}>
            <option value="">Choose…</option>
            {DOCUMENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Title"
          hint="Optional, e.g. “BBMP trade licence 2026”"
          error={err.title?.message}
        >
          <Input {...form.register('title')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Issued on" error={err.issued_on?.message}>
            <Input type="date" {...form.register('issued_on')} />
          </Field>
          <Field
            label="Expires on"
            hint="We show a warning 30 days before."
            error={err.expires_on?.message}
          >
            <Input type="date" {...form.register('expires_on')} />
          </Field>
        </div>
        <Field label="Note" error={err.note?.message}>
          <Textarea rows={3} {...form.register('note')} />
        </Field>
        <ErrorAlert
          error={save.error}
          fields={['file', 'kind', 'title', 'issued_on', 'expires_on', 'note']}
        />
      </form>
    </Dialog>
  )
}

function DocumentActions({ property, doc }: { property: Property; doc: PropertyDocument }) {
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const remove = useApiMutation(
    () => api.delete(`/property-documents/${doc.id}/`),
    PROPERTY_QUERIES,
  )
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${doc.display_title}`}>
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem
            icon={<Download />}
            onSelect={() =>
              void downloadFile(`/property-documents/${doc.id}/download/`, doc.file_name).catch(
                (e: Error) => toast.error(e.message),
              )
            }
          >
            Download
          </MenuItem>
          <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
            Edit details
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} destructive onSelect={() => setRemoving(true)}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
      {editing && <DocumentDialog property={property} doc={doc} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Delete ${doc.display_title}?`}
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setRemoving(false)
              toast.success('Document deleted')
            },
          })
        }
      >
        <p>The file is deleted for good. The activity log keeps a note that it existed.</p>
        {doc.is_proof && property.verification_status === 'verified' && (
          <p>This is a proof document, so the property goes back to “Being checked”.</p>
        )}
      </ConfirmDialog>
    </>
  )
}

function VerificationCard({
  property,
  hasProof,
  canManage,
}: {
  property: Property
  hasProof: boolean
  canManage: boolean
}) {
  const history = useApi<VerificationEvent[]>(`/properties/${property.id}/verification/`)
  const [note, setNote] = useState('')
  const submit = useApiMutation(
    () => api.post<Property>(`/properties/${property.id}/submit-verification/`, { note }),
    PROPERTY_QUERIES,
    () => {
      toast.success('Sent to the PG Manager team for checking')
      setNote('')
    },
  )
  const status = property.verification_status
  const canSubmit = ['unverified', 'changes_requested', 'rejected'].includes(status)
  const latest = history.data?.[0]
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" /> Verification
          </span>
        }
        description="A verified property gets a “Verified” badge. We check that you own it or may run it."
        actions={
          <Badge tone={VERIFICATION_TONE[status]} dot>
            {property.verification_status_label}
          </Badge>
        }
      />
      <CardContent className="grid gap-4">
        {status === 'changes_requested' && latest?.note && (
          <Alert tone="warn" title="The PG Manager team asked for changes">
            {latest.note}
          </Alert>
        )}
        {status === 'rejected' && latest?.note && (
          <Alert tone="bad" title="Not approved">
            {latest.note}
          </Alert>
        )}
        {canManage && canSubmit && (
          <div className="grid gap-3 rounded-lg border bg-secondary/40 p-4">
            {!hasProof && (
              <p className="text-[13px] text-amber-800">
                First upload one of: ownership proof, a rental agreement with the owner, or a letter
                allowing you to manage the property.
              </p>
            )}
            <Field label="Message for the team (optional)">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div>
              <Button
                disabled={!hasProof}
                busy={submit.isPending}
                onClick={() => submit.mutate(undefined)}
              >
                <Send /> Send for verification
              </Button>
            </div>
            <ErrorAlert error={submit.error} />
          </div>
        )}
        {(history.data?.length ?? 0) > 0 && (
          <ol className="grid gap-3 border-l pl-4">
            {history.data!.map((e) => (
              <li key={e.id} className="relative text-[13px]">
                <span
                  className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary"
                  aria-hidden
                />
                <p>
                  <span className="font-medium">{e.status_label}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {e.by} · {formatDate(e.created_at.slice(0, 10))}
                  </span>
                </p>
                {e.note && <p className="text-muted-foreground">{e.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export function DocumentsTab({ property, canManage }: { property: Property; canManage: boolean }) {
  const docs = useApi<PropertyDocument[]>(
    canManage ? `/properties/${property.id}/documents/` : null,
  )
  const [adding, setAdding] = useState(false)
  if (!canManage)
    return (
      <EmptyState icon={<FileText />} title="Only owners and managers can see documents">
        Ask the owner if you need a document.
      </EmptyState>
    )
  const rows = docs.data ?? []
  const attention = rows.filter((d) => d.expiry === 'expired' || d.expiry === 'expiring')
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="grid min-w-0 gap-4 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            Private files: ownership proof, licences, NOCs, bills. Only owners and managers can open
            them.
          </p>
          <Button onClick={() => setAdding(true)}>
            <Upload /> Upload document
          </Button>
        </div>
        {attention.length > 0 && (
          <Alert
            tone="warn"
            title={`${attention.length} document${attention.length === 1 ? ' needs' : 's need'} renewing`}
          >
            {attention.map((d) => `${d.display_title}: ${d.expiry_label}`).join(' · ')}
          </Alert>
        )}
        <ErrorAlert error={docs.error} />
        {docs.isLoading ? (
          <Skeleton className="h-48" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="No documents yet"
            actions={
              <Button onClick={() => setAdding(true)}>
                <Upload /> Upload the first document
              </Button>
            }
          >
            Keep ownership proof, the lease with the owner, trade licence and fire NOC here, with
            their expiry dates.
          </EmptyState>
        ) : (
          <Card>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Document</TH>
                  <TH className="hidden md:table-cell">Validity</TH>
                  <TH className="hidden 2xl:table-cell">Uploaded</TH>
                  <TH className="w-12">
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((d) => (
                  <TR key={d.id}>
                    <TD>
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                          <FileText className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="block cursor-pointer truncate text-left font-medium hover:underline"
                            onClick={() =>
                              void downloadFile(
                                `/property-documents/${d.id}/download/`,
                                d.file_name,
                              ).catch((e: Error) => toast.error(e.message))
                            }
                          >
                            {d.display_title}
                          </button>
                          <p className="truncate text-xs text-muted-foreground">
                            {d.title ? `${d.kind_label} · ` : ''}
                            {d.file_name} · {fileSize(d.size_bytes)}
                            {d.is_proof && ' · Proof'}
                          </p>
                          <div className="mt-1 md:hidden">
                            <Badge
                              tone={EXPIRY_TONE[d.expiry as keyof typeof EXPIRY_TONE] ?? 'neutral'}
                            >
                              {d.expiry_label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden md:table-cell">
                      <Badge
                        tone={EXPIRY_TONE[d.expiry as keyof typeof EXPIRY_TONE] ?? 'neutral'}
                        dot
                      >
                        {d.expiry_label}
                      </Badge>
                      {d.issued_on && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Issued {formatDate(d.issued_on)}
                        </p>
                      )}
                    </TD>
                    <TD className="hidden text-[13px] whitespace-nowrap text-muted-foreground 2xl:table-cell">
                      {formatDate(d.created_at.slice(0, 10))}
                      {d.uploaded_by && <span className="block text-xs">by {d.uploaded_by}</span>}
                    </TD>
                    <TD>
                      <DocumentActions property={property} doc={d} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </div>
      <VerificationCard
        property={property}
        hasProof={rows.some((d) => d.is_proof)}
        canManage={canManage}
      />
      {adding && <DocumentDialog property={property} onOpenChange={setAdding} />}
    </div>
  )
}
