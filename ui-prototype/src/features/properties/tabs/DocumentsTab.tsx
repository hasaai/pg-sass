import { Download, FileText, FileUp, MoreHorizontal, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { Badge } from '../../../components/ui-kit/badge'
import { Button } from '../../../components/ui-kit/button'
import { ConfirmDialog } from '../../../components/ui-kit/confirm'
import { Dialog } from '../../../components/ui-kit/dialog'
import { Alert, EmptyState } from '../../../components/ui-kit/feedback'
import { Field } from '../../../components/ui-kit/field'
import { Input, NativeSelect } from '../../../components/ui-kit/input'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../../components/ui-kit/menu'
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui-kit/table'
import { toast } from '../../../components/ui-kit/toast'
import { TODAY } from '../../../data/seed'
import { newId } from '../../../data/store'
import type { Property } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { formatDate, plural } from '../../../lib/format'
import { patchProperty } from '../actions'
import { DOC_KINDS, docStatus, downloadText } from '../lib'

type Doc = Property['documents'][number]

const STATUS_BADGE = {
  ok: null,
  expiring: { tone: 'warn', label: 'Expiring soon' },
  expired: { tone: 'bad', label: 'Expired' },
} as const

export function DocumentsTab({ property }: { property: Property }) {
  const { can } = useSession()
  const manage = can('properties.manage')
  const [upload, setUpload] = useState<{ replace?: Doc } | null>(null)
  const [removing, setRemoving] = useState<Doc | null>(null)
  const docs = property.documents.map((d) => ({ ...d, status: docStatus(d.expiresOn) }))
  const attention = docs.filter((d) => d.status !== 'ok')

  function download(d: Doc) {
    downloadText(
      `${d.title.replace(/[^\w-]+/g, '-')}.txt`,
      `${property.name} (${property.reference})\n${d.kind}: ${d.title}\nUploaded ${formatDate(d.uploadedOn)}${d.expiresOn ? `\nValid till ${formatDate(d.expiresOn)}` : ''}\n\n(Sample file from the PG Manager prototype)\n`,
      'text/plain',
    )
    toast.success(`Downloading ${d.title}`)
  }

  return (
    <div className="grid gap-4">
      {attention.length > 0 && (
        <Alert
          tone={attention.some((d) => d.status === 'expired') ? 'bad' : 'warn'}
          title={`${plural(attention.length, 'document')} need${attention.length === 1 ? 's' : ''} renewing`}
        >
          {attention
            .map(
              (d) =>
                `${d.title} (${d.status === 'expired' ? 'expired' : 'expires'} ${formatDate(d.expiresOn)})`,
            )
            .join(' · ')}
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          Private files. Only owners and managers can open them. The PG Manager team sees them only
          when you send the property for checking.
        </p>
        {manage && (
          <Button onClick={() => setUpload({})}>
            <Upload /> Upload document
          </Button>
        )}
      </div>
      {docs.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No documents yet"
          actions={
            manage && (
              <Button onClick={() => setUpload({})}>
                <Upload /> Upload document
              </Button>
            )
          }
        >
          Upload the rental agreement with the building owner (or ownership papers), trade licence
          and fire safety certificate. They are needed to get verified.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Table>
            <THead>
              <TR>
                <TH>Document</TH>
                <TH>Uploaded</TH>
                <TH>Valid till</TH>
                <TH className="w-12">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {docs.map((d) => {
                const b = STATUS_BADGE[d.status]
                return (
                  <TR key={d.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                          <FileText className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium whitespace-nowrap">{d.title}</p>
                          <p className="text-xs whitespace-nowrap text-muted-foreground">
                            {d.kind}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(d.uploadedOn)}</TD>
                    <TD className="whitespace-nowrap">
                      <span className="mr-2">
                        {d.expiresOn ? formatDate(d.expiresOn) : 'No expiry'}
                      </span>
                      {b && (
                        <Badge tone={b.tone} dot>
                          {b.label}
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${d.title}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem icon={<Download />} onSelect={() => download(d)}>
                            Download
                          </MenuItem>
                          {manage && (
                            <>
                              <MenuItem
                                icon={<RefreshCw />}
                                onSelect={() => setUpload({ replace: d })}
                              >
                                Replace with a new file
                              </MenuItem>
                              <MenuSeparator />
                              <MenuItem
                                icon={<Trash2 />}
                                destructive
                                onSelect={() => setRemoving(d)}
                              >
                                Delete
                              </MenuItem>
                            </>
                          )}
                        </MenuContent>
                      </Menu>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </div>
      )}
      {upload && (
        <UploadDialog
          key={upload.replace?.id ?? 'new'}
          property={property}
          replace={upload.replace}
          onClose={() => setUpload(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete ${removing?.title ?? 'document'}?`}
        confirmLabel="Delete document"
        destructive
        onConfirm={() => {
          if (!removing) return
          patchProperty(
            property.id,
            { documents: property.documents.filter((d) => d.id !== removing.id) },
            `Deleted the document ${removing.title}`,
          )
          toast.success(`${removing.title} deleted`)
          setRemoving(null)
        }}
      >
        <p>
          The file is removed for everyone.{' '}
          {property.verification === 'verified' &&
            'Removing a proof document may need the property to be checked again.'}
        </p>
      </ConfirmDialog>
    </div>
  )
}

function UploadDialog({
  property,
  replace,
  onClose,
}: {
  property: Property
  replace?: Doc
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState(replace?.kind ?? DOC_KINDS[0]!)
  const [title, setTitle] = useState(replace?.title ?? '')
  const [expires, setExpires] = useState(replace?.expiresOn ?? '')
  const [file, setFile] = useState('')
  const [errors, setErrors] = useState<{ title?: string; file?: string; expires?: string }>({})

  function save() {
    const e: typeof errors = {}
    if (!title.trim()) e.title = 'Give the document a name, e.g. Trade licence 2026.'
    if (!file) e.file = 'Choose the file to upload (PDF or photo).'
    if (expires && expires < TODAY)
      e.expires = 'This date is in the past. Upload the renewed document.'
    setErrors(e)
    if (Object.keys(e).length) return
    const doc: Doc = {
      id: replace?.id ?? newId('d'),
      kind,
      title: title.trim(),
      uploadedOn: TODAY,
      expiresOn: expires || undefined,
      status: docStatus(expires || undefined),
    }
    const list = replace
      ? property.documents.map((d) => (d.id === replace.id ? doc : d))
      : [...property.documents, doc]
    const backToCheck = replace && property.verification === 'verified'
    patchProperty(
      property.id,
      { documents: list, ...(backToCheck ? { verification: 'under_review' as const } : {}) },
      replace ? `Replaced the document ${doc.title}` : `Uploaded the document ${doc.title}`,
    )
    toast.success(replace ? `${doc.title} replaced` : `${doc.title} uploaded`)
    if (backToCheck) toast.info('A proof document changed, so the property is being checked again.')
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={replace ? `Replace ${replace.title}` : 'Upload a document'}
      description={property.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{replace ? 'Replace document' : 'Upload document'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="What is it?" required>
          <NativeSelect
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={Boolean(replace)}
          >
            {DOC_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Name" required error={errors.title}>
          <Input
            value={title}
            placeholder="BBMP trade licence 2026"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Valid till"
          hint="Leave empty if it does not expire. We remind you 60 days before."
          error={errors.expires}
        >
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <div className="grid gap-1.5">
          <p className="text-[13px] font-medium">
            File <span className="text-destructive">*</span>
          </p>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept=".pdf,image/*"
            aria-label="Choose file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setFile(f.name)
                setErrors((x) => ({ ...x, file: undefined }))
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center text-muted-foreground hover:border-primary/50 hover:bg-accent"
          >
            <FileUp className="size-6" />
            <span className="text-sm font-medium text-foreground">{file || 'Choose a file'}</span>
            <span className="text-xs">PDF, JPG or PNG, up to 10 MB</span>
          </button>
          {!file && (
            <button
              type="button"
              className="justify-self-start text-xs text-primary hover:underline"
              onClick={() => {
                setFile(`${kind.toLowerCase().replace(/[^a-z]+/g, '-')}.pdf`)
                setErrors((x) => ({ ...x, file: undefined }))
              }}
            >
              Use a sample file
            </button>
          )}
          {errors.file && <p className="text-xs font-medium text-destructive">{errors.file}</p>}
        </div>
      </div>
    </Dialog>
  )
}
