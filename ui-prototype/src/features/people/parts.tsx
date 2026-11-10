/** Small building blocks shared by the tenant and rent screens. */
import { BedDouble, Check, Snowflake } from 'lucide-react'
import { useState } from 'react'

import { FilterChips } from '../../components/common'
import { NativeSelect } from '../../components/ui-kit/input'
import { BED_STATUS, floorName } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { BedStatus } from '../../data/types'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'

/* ---------------------------------------------------------------- bed picker */

const BED_TONE: Record<BedStatus, string> = {
  vacant:
    'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-500 hover:bg-emerald-100',
  occupied: 'border-border bg-secondary text-muted-foreground',
  notice: 'border-amber-200 bg-amber-50 text-amber-800',
  reserved: 'border-amber-200 bg-amber-50/60 text-amber-800',
  blocked: 'border-dashed border-border bg-card text-muted-foreground',
}

/**
 * Property → floor → bed chips. Only vacant beds can be picked (plus `allowBedId`, e.g. a bed
 * reserved for this person).
 */
export function BedPicker({
  propertyId,
  onPropertyChange,
  bedId,
  onBedChange,
  excludeBedId,
  error,
}: {
  propertyId: string
  onPropertyChange: (id: string) => void
  bedId: string
  onBedChange: (id: string, rent: number) => void
  excludeBedId?: string
  error?: string
}) {
  const properties = useDb((db) => db.properties)
  const allRooms = useDb((db) => db.rooms)
  const allBeds = useDb((db) => db.beds)
  const tenants = useDb((db) => db.tenants)
  const rooms = allRooms.filter((r) => r.propertyId === propertyId)
  const beds = allBeds.filter((b) => b.propertyId === propertyId)
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b)
  const selectedRoom = allRooms.find((r) => r.id === allBeds.find((b) => b.id === bedId)?.roomId)
  const [floor, setFloor] = useState<string>(String(selectedRoom?.floor ?? floors[0] ?? 1))
  const activeFloor = floors.includes(Number(floor)) ? Number(floor) : (floors[0] ?? 1)
  const free = (f: number) =>
    beds.filter(
      (b) =>
        b.status === 'vacant' &&
        b.id !== excludeBedId &&
        rooms.find((r) => r.id === b.roomId)?.floor === f,
    ).length
  const totalFree = beds.filter((b) => b.status === 'vacant' && b.id !== excludeBedId).length

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label="Property"
          value={propertyId}
          onChange={(e) => {
            onPropertyChange(e.target.value)
            setFloor('')
          }}
          className="w-auto min-w-56"
        >
          {properties
            .filter((p) => p.status !== 'archived')
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.status === 'draft' ? ' (not open yet)' : ''}
              </option>
            ))}
        </NativeSelect>
        <span className="text-[13px] text-muted-foreground">
          {totalFree} free {totalFree === 1 ? 'bed' : 'beds'} here
        </span>
      </div>
      {floors.length > 0 && (
        <FilterChips
          label="Floor"
          value={String(activeFloor)}
          onChange={setFloor}
          options={floors.map((f) => ({ value: String(f), label: floorName(f), count: free(f) }))}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {rooms
          .filter((r) => r.floor === activeFloor)
          .map((room) => {
            const roomBeds = beds.filter((b) => b.roomId === room.id)
            return (
              <div key={room.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Room {room.number}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <span>{room.sharing === 1 ? 'Single' : `${room.sharing} sharing`}</span>
                      {room.ac && (
                        <span className="inline-flex items-center gap-0.5">
                          · <Snowflake className="size-3" /> AC
                        </span>
                      )}
                      {room.attachedBath && <span>· Attached bath</span>}
                    </p>
                  </div>
                  <span className="text-xs font-medium tabular-nums">
                    {formatMoney(room.rentPerBed)}/mo
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {roomBeds.map((b) => {
                    const pickable = b.status === 'vacant' && b.id !== excludeBedId
                    const selected = b.id === bedId
                    const who = tenants.find((t) => t.id === b.tenantId)
                    const title =
                      b.id === excludeBedId
                        ? 'Current bed'
                        : pickable
                          ? `Bed ${b.label} is free`
                          : `${BED_STATUS[b.status].label}${who ? ` – ${who.name}` : ''}`
                    return (
                      <button
                        key={b.id}
                        type="button"
                        disabled={!pickable}
                        title={title}
                        aria-pressed={selected}
                        aria-label={`Room ${room.number} bed ${b.label}: ${title}`}
                        onClick={() => onBedChange(b.id, b.rent)}
                        className={cn(
                          'inline-flex h-9 min-w-16 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground ring-2 ring-primary/25'
                            : b.id === excludeBedId
                              ? 'border-primary/40 bg-accent text-accent-foreground'
                              : BED_TONE[b.status],
                        )}
                      >
                        {selected ? (
                          <Check className="size-3.5" />
                        ) : (
                          <BedDouble className="size-3.5" />
                        )}
                        {b.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        {rooms.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground sm:col-span-2">
            This property has no rooms yet. Add rooms on the Properties page first.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend className="border-emerald-300 bg-emerald-50" label="Free" />
        <Legend className="border-border bg-secondary" label="Filled" />
        <Legend className="border-amber-200 bg-amber-50" label="Reserved / on notice" />
        <Legend className="border-dashed border-border bg-card" label="Not available" />
      </div>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-3 rounded-sm border', className)} />
      {label}
    </span>
  )
}

/* ---------------------------------------------------------------- UPI QR placeholder */

/** A QR-looking pattern (not scannable) standing in for the UPI payment code. */
export function FakeQr({ text, size = 132 }: { text: string; size?: number }) {
  const n = 25
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const cells: [number, number][] = []
  let s = h >>> 0
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      const inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)
      if (!inFinder && s % 100 < 47) cells.push([x, y])
    }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} fill="currentColor" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="white" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="currentColor" />
    </g>
  )
  return (
    <svg
      viewBox={`-1 -1 ${n + 2} ${n + 2}`}
      width={size}
      height={size}
      role="img"
      aria-label="UPI payment code"
      className="rounded-md bg-white text-slate-900"
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  )
}

/** When printing, show only the element with this id (the rest of the app is hidden). */
export function PrintOnly({ id }: { id: string }) {
  return (
    <style>{`@media print {
  body * { visibility: hidden !important; }
  #${id}, #${id} * { visibility: visible !important; }
  #${id} { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; }
}`}</style>
  )
}

/** A label/value row used in bill and receipt summaries. */
export function SumRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'good' | 'bad'
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-1 text-sm',
        strong && 'font-semibold',
      )}
    >
      <span className={cn(!strong && 'text-muted-foreground')}>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          tone === 'good' && 'text-emerald-700',
          tone === 'bad' && 'text-red-700',
        )}
      >
        {value}
      </span>
    </div>
  )
}
