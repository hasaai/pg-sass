/** Upload many rooms from a spreadsheet (CSV). The file is checked first; only good rows are added. */
import { CheckCircle2, Download, FileSpreadsheet, FileUp, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { Badge } from '../../../components/ui-kit/badge'
import { Button } from '../../../components/ui-kit/button'
import { Dialog } from '../../../components/ui-kit/dialog'
import { Alert } from '../../../components/ui-kit/feedback'
import { Table, TBody, TD, TH, THead, TR } from '../../../components/ui-kit/table'
import { toast } from '../../../components/ui-kit/toast'
import { ROOM_FEATURES } from '../../../data/seed'
import { floorName } from '../../../data/selectors'
import { getDb } from '../../../data/store'
import type { Property, Room } from '../../../data/types'
import { formatMoney, plural, rupeesToPaise } from '../../../lib/format'
import { addRooms } from '../actions'
import type { NewRoomInput } from '../actions'
import { downloadText, nextRoomNumber, nextNumber } from '../lib'

const BASE_COLUMNS = [
  'room',
  'floor',
  'sharing',
  'rent_per_bed',
  'whole_room_rent',
  'room_type',
  'ac',
  'attached_bathroom',
]
const COLUMNS = [...BASE_COLUMNS, ...ROOM_FEATURES.map((f) => f.name)]

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function toCsv(rows: string[][]) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

function templateCsv() {
  const feat = (keys: Record<string, string>) => ROOM_FEATURES.map((f) => keys[f.key] ?? '')
  return toCsv([
    COLUMNS,
    [
      '101',
      '1',
      '2',
      '9500',
      '',
      'shared',
      'yes',
      'yes',
      ...feat({ bed: 'yes', mattress: 'yes', wardrobe: 'yes', fan: 'yes' }),
    ],
    [
      '102',
      '1',
      '1',
      '',
      '15000',
      'private',
      'no',
      'yes',
      ...feat({ bed: 'yes', mattress: 'yes', television: '300', balcony: 'yes' }),
    ],
  ])
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

interface Parsed {
  line: number
  room: string
  floor: string
  sharing: string
  rentLabel: string
  problems: string[]
  input?: NewRoomInput
}

const YES = ['yes', 'y', 'true', '1']
const NO = ['no', 'n', 'false', '0', '']

function check(property: Property, rows: string[][]): Parsed[] | string {
  const [header, ...data] = rows
  if (!header) return 'The file is empty. Download the template and fill one row per room.'
  const cols = header.map((h) => h.trim().toLowerCase())
  const at = (r: string[], name: string) => (r[cols.indexOf(name.toLowerCase())] ?? '').trim()
  if (!cols.includes('room'))
    return 'This file has no “room” column. Download the template and fill it in.'
  if (!data.length) return 'The file has only the heading row. Add one row per room.'
  const existing = new Set(
    getDb()
      .rooms.filter((r) => r.propertyId === property.id)
      .map((r) => r.number.toLowerCase()),
  )
  const seen = new Set<string>()
  return data.map((r, i) => {
    const problems: string[] = []
    const room = at(r, 'room')
    const floor = at(r, 'floor')
    const sharing = at(r, 'sharing')
    const perBed = at(r, 'rent_per_bed')
    const whole = at(r, 'whole_room_rent')
    if (!room) problems.push('Room number is empty.')
    else if (existing.has(room.toLowerCase())) problems.push(`Room ${room} is already added.`)
    else if (seen.has(room.toLowerCase())) problems.push(`Room ${room} is twice in the file.`)
    seen.add(room.toLowerCase())
    if (!/^\d+$/.test(floor) || Number(floor) > 30)
      problems.push('Floor must be a number from 0 (ground) to 30.')
    if (!/^[1-6]$/.test(sharing)) problems.push('Sharing must be 1 to 6 beds.')
    const letting: Room['letting'] = whole && !perBed ? 'whole' : 'by_bed'
    const rentRaw = letting === 'whole' ? whole : perBed
    const rent = rentRaw ? rupeesToPaise(rentRaw) : null
    if (!rentRaw) problems.push('Rent is empty. Fill rent_per_bed or whole_room_rent.')
    else if (rent === null || rent === 0) problems.push(`Rent “${rentRaw}” is not an amount.`)
    const yn = (name: string, label: string) => {
      const v = at(r, name).toLowerCase()
      if (YES.includes(v)) return true
      if (!NO.includes(v)) problems.push(`${label} must be yes or no.`)
      return false
    }
    const ac = yn('ac', 'AC')
    const attachedBath = yn('attached_bathroom', 'Attached bathroom')
    const features: Room['features'] = []
    for (const f of ROOM_FEATURES) {
      const v = (cols.includes(f.name.toLowerCase()) ? at(r, f.name) : at(r, f.key)).toLowerCase()
      if (NO.includes(v)) continue
      if (YES.includes(v)) features.push({ key: f.key, name: f.name })
      else {
        const p = rupeesToPaise(v)
        if (p === null) problems.push(`${f.name}: type yes, no or an extra charge in rupees.`)
        else features.push({ key: f.key, name: f.name, extra: p })
      }
    }
    return {
      line: i + 2,
      room,
      floor: /^\d+$/.test(floor) ? floorName(Number(floor)) : floor || '—',
      sharing: sharing ? `${sharing} sharing` : '—',
      rentLabel: rent ? `${formatMoney(rent)} / ${letting === 'whole' ? 'room' : 'bed'}` : '—',
      problems,
      input: problems.length
        ? undefined
        : {
            floor: Number(floor),
            number: room,
            sharing: Number(sharing),
            letting,
            rent: rent!,
            ac,
            attachedBath,
            features,
          },
    }
  })
}

/** A realistic sample: a new floor of rooms, with two rows that have problems. */
function sampleCsv(property: Property, rooms: Room[]) {
  const floor = Math.max(property.floors, ...rooms.map((r) => r.floor)) + 1
  let n = nextRoomNumber(floor, rooms)
  const feat = (keys: Record<string, string>) => ROOM_FEATURES.map((f) => keys[f.key] ?? '')
  const std = { bed: 'yes', mattress: 'yes', wardrobe: 'yes', fan: 'yes' }
  const rows: string[][] = [COLUMNS]
  const add = (
    sharing: string,
    perBed: string,
    whole: string,
    ac: string,
    bath: string,
    f: Record<string, string>,
  ) => {
    rows.push([
      n,
      String(floor),
      sharing,
      perBed,
      whole,
      sharing === '1' ? 'private' : 'shared',
      ac,
      bath,
      ...feat(f),
    ])
    n = nextNumber(n)
  }
  add('2', '9500', '', 'yes', 'yes', std)
  add('3', '8000', '', 'no', 'yes', std)
  add('2', '9500', '', 'yes', 'no', { ...std, balcony: 'yes' })
  add('1', '', '15500', 'yes', 'yes', { ...std, television: '300' })
  add('8', '6000', '', 'no', 'no', std)
  add('2', '', '', 'no', 'yes', std)
  if (rooms[0])
    rows.push([
      rooms[0].number,
      String(rooms[0].floor),
      '2',
      '9000',
      '',
      'shared',
      'no',
      'no',
      ...feat(std),
    ])
  return toCsv(rows)
}

export function ImportCsvDialog({
  property,
  rooms,
  onClose,
}: {
  property: Property
  rooms: Room[]
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<Parsed[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const good = rows?.filter((r) => r.input) ?? []
  const bad = rows?.filter((r) => !r.input) ?? []
  const beds = good.reduce((s, r) => s + (r.input?.sharing ?? 0), 0)

  function load(text: string, name: string) {
    setFileName(name)
    const res = check(property, parseCsv(text))
    if (typeof res === 'string') {
      setError(res)
      setRows(null)
    } else {
      setError(null)
      setRows(res)
    }
  }

  function add() {
    const err = addRooms(
      property,
      good.map((r) => r.input!),
    )
    if (err) setError(err)
    else onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      className="max-w-2xl"
      title="Upload rooms from a file"
      description={`Add many rooms to ${property.name} at once from Excel or Google Sheets.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!good.length} onClick={add}>
            {good.length ? `Add ${plural(good.length, 'room')}` : 'Add rooms'}
          </Button>
        </>
      }
    >
      <ol className="grid gap-5">
        <Step n={1} title="Download the template">
          <p className="mb-2 text-[13px] text-muted-foreground">
            One row per room. Columns: room, floor (0 = ground), sharing (1–6), rent per bed or
            whole room rent, AC and attached bathroom (yes / no), and one column for each room
            feature: yes when it is included, or an amount for an extra charge.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadText('rooms-template.csv', templateCsv())
              toast.success('Template downloaded')
            }}
          >
            <Download /> Download template (.csv)
          </Button>
        </Step>
        <Step n={2} title="Fill it in Excel or Google Sheets">
          <p className="text-[13px] text-muted-foreground">
            Save or download it as CSV (comma separated).
          </p>
        </Step>
        <Step n={3} title="Choose the file">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Choose CSV file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void f.text().then((t) => load(t, f.name))
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp /> Choose file
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => load(sampleCsv(property, rooms), 'sample-rooms.csv')}
            >
              <FileSpreadsheet /> Try with a sample file
            </Button>
            {fileName && <span className="text-[13px] text-muted-foreground">{fileName}</span>}
          </div>
        </Step>
        {error && (
          <Alert tone="bad" title="We couldn’t use this file">
            {error}
          </Alert>
        )}
        {rows && (
          <Step n={4} title="Check and add">
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone="good">
                <CheckCircle2 /> {plural(good.length, 'room')} ready ({plural(beds, 'bed')})
              </Badge>
              {bad.length > 0 && (
                <Badge tone="bad">
                  <TriangleAlert /> {plural(bad.length, 'row')} with problems
                </Badge>
              )}
            </div>
            {bad.length > 0 && (
              <p className="mb-3 text-[13px] text-muted-foreground">
                Rows with problems are skipped. Fix them in the file and upload it again, or add the
                good rows now.
              </p>
            )}
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <THead>
                  <TR>
                    <TH>Row</TH>
                    <TH>Room</TH>
                    <TH>Floor</TH>
                    <TH>Sharing</TH>
                    <TH>Rent</TH>
                    <TH>Check</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.line} className={r.input ? '' : 'bg-red-50/50'}>
                      <TD className="text-muted-foreground tabular-nums">{r.line}</TD>
                      <TD className="font-medium">{r.room || '—'}</TD>
                      <TD className="whitespace-nowrap">{r.floor}</TD>
                      <TD className="whitespace-nowrap">{r.sharing}</TD>
                      <TD className="whitespace-nowrap tabular-nums">{r.rentLabel}</TD>
                      <TD className="min-w-48">
                        {r.input ? (
                          <Badge tone="good" dot>
                            OK
                          </Badge>
                        ) : (
                          <span className="text-[13px] text-red-700">{r.problems.join(' ')}</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </Step>
        )}
      </ol>
    </Dialog>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-3">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {n}
      </span>
      <div className="min-w-0">
        <p className="mb-1 text-sm font-semibold">{title}</p>
        {children}
      </div>
    </li>
  )
}
