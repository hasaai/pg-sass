/** Add many rooms and beds at once from a CSV file: check first, then add all or nothing. */
import { useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Download, FileUp } from 'lucide-react'
import { useState } from 'react'

import { api, downloadFile } from '../../../api/client'
import type { components } from '../../../api/schema'
import type { Property } from '../../../api/types'
import { Badge } from '../../../components/ui-kit/badge'
import { Button } from '../../../components/ui-kit/button'
import { Dialog } from '../../../components/ui-kit/dialog'
import { Alert, ErrorAlert } from '../../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui-kit/table'
import { toast } from '../../../components/ui-kit/toast'
import { formatMoney, plural } from '../../../lib/format'
import { PROPERTY_QUERIES } from '../api'

type Result = components['schemas']['RoomImportResult']

function downloadTemplate(name: string) {
  return downloadFile(
    '/properties/rooms-import-template/',
    `rooms-${name.replace(/\W+/g, '-').toLowerCase()}.csv`,
  )
}

export function ImportRoomsDialog({
  open,
  onOpenChange,
  property,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  property: Property
}) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function send(commit: boolean, chosen = file) {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', chosen)
      form.append('commit', String(commit))
      const r = await api.upload<Result>(`/properties/${property.id}/rooms-import/`, form)
      if (commit) {
        await queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === 'string' &&
            PROPERTY_QUERIES.some((p) => String(q.queryKey[0]).startsWith(p)),
        })
        toast.success(`${plural(r.created, 'room')} added`)
        close()
      } else setResult(r)
    } catch (e) {
      setError(e)
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setFile(null)
    setResult(null)
    setError(null)
    onOpenChange(false)
  }

  const ok = result && result.invalid === 0 && result.valid > 0
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      variant="side"
      title="Upload rooms from a file"
      description="Add many rooms and their beds at once from a CSV file (Excel: Save as → CSV UTF-8)."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!ok} busy={busy && Boolean(result)} onClick={() => void send(true)}>
            {result && ok
              ? `Add ${plural(result.valid, 'room')}${result.beds ? ` and ${plural(result.beds, 'bed')}` : ''}`
              : 'Add rooms'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <ol className="grid gap-2 text-[13px] text-muted-foreground">
          <li>
            1. Download the template and fill one line per room.{' '}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void downloadTemplate(property.name).catch(() =>
                  toast.error('Could not download the template. Try again.'),
                )
              }
            >
              <Download /> Template
            </Button>
          </li>
          <li>
            2. <strong className="text-foreground">sharing</strong> is how many beds the room has.
            Give <strong className="text-foreground">rent_per_bed</strong> for bed by bed, or{' '}
            <strong className="text-foreground">whole_room_rent</strong> for a room rented whole.
            Use the <strong className="text-foreground">flat</strong> column only for rooms inside a
            flat.
          </li>
          <li>
            3. The template has one column for each room amenity (Balcony, Hot water / geyser …).
            Write <strong className="text-foreground">yes</strong> when it is included in the rent,
            an amount like <strong className="text-foreground">300</strong> for an extra charge per
            month, or leave it empty.
          </li>
          <li>4. Choose the file. We check every line before anything is added.</li>
        </ol>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm font-medium hover:bg-accent [&_svg]:size-4">
          <FileUp />
          {file ? file.name : 'Choose a CSV file'}
          <input
            type="file"
            className="sr-only"
            aria-label="Rooms CSV file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              e.target.value = ''
              setFile(f)
              setResult(null)
              if (f) void send(false, f)
            }}
          />
        </label>

        <ErrorAlert error={error} />
        {busy && !result && <p className="text-[13px] text-muted-foreground">Checking the file…</p>}

        {result &&
          (result.invalid ? (
            <Alert
              tone="bad"
              title={`${plural(result.invalid, 'line')} ${result.invalid === 1 ? 'needs' : 'need'} fixing`}
            >
              Nothing has been added. Fix these lines in your file and choose it again.
            </Alert>
          ) : (
            <Alert tone="good" title="Everything looks right">
              {plural(result.valid, 'room')}
              {result.beds ? ` and ${plural(result.beds, 'bed')}` : ''} will be added to{' '}
              {property.name}.
            </Alert>
          ))}

        {result && (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-14">Line</TH>
                <TH>Room</TH>
                <TH>Sharing</TH>
                <TH>Rent</TH>
                <TH>Check</TH>
              </TR>
            </THead>
            <TBody>
              {result.rows.map((r) => (
                <TR key={r.row}>
                  <TD className="text-[13px] text-muted-foreground tabular-nums">{r.row}</TD>
                  <TD className="text-[13px]">
                    {r.flat ? `${r.flat} · ` : ''}Room {r.room || '—'}
                    {r.floor !== null && (
                      <span className="block text-xs text-muted-foreground">Floor {r.floor}</span>
                    )}
                  </TD>
                  <TD className="text-[13px] tabular-nums">{r.sharing ?? '—'}</TD>
                  <TD className="text-[13px] tabular-nums">
                    {r.whole_room_rent !== null
                      ? `${formatMoney(r.whole_room_rent)} room`
                      : r.rent_per_bed !== null
                        ? `${formatMoney(r.rent_per_bed)} bed`
                        : '—'}
                  </TD>
                  <TD className="text-[13px]">
                    {r.problems.length === 0 ? (
                      <Badge tone="good">
                        <CircleCheck /> OK
                      </Badge>
                    ) : (
                      <ul className="grid gap-0.5 text-destructive">
                        {r.problems.map((m) => (
                          <li key={m} className="flex gap-1">
                            <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {m}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Dialog>
  )
}
