import { BedSingle, Layers, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'

import { SearchBox } from '../../../components/common'
import { Button } from '../../../components/ui-kit/button'
import { Card } from '../../../components/ui-kit/card'
import { Segmented } from '../../../components/ui-kit/choice-cards'
import { EmptyState } from '../../../components/ui-kit/feedback'
import { BED_STATUS } from '../../../data/selectors'
import { useDb } from '../../../data/store'
import type { Bed, Property, Room, Tenant } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { cn } from '../../../lib/cn'
import { formatMoney, plural } from '../../../lib/format'
import { addBed, deleteRoom } from '../actions'
import { Pill } from '../bits'
import {
  BED_DOT,
  BED_STYLE,
  bedCounts,
  compareRoomNumbers,
  floorLabel,
  floorsOf,
  nextRoomNumber,
} from '../lib'
import { BedMenu } from './BedMenu'
import { ImportCsvDialog } from './ImportCsvDialog'
import { QuickAddRooms } from './QuickAddRooms'
import type { QuickAddDefaults } from './QuickAddRooms'
import { BedRentDialog, EditRoomDialog, FloorsDialog } from './RoomDialogs'

interface Ctx {
  property: Property
  bedsOf: Map<string, Bed[]>
  tenantOf: Map<string, Tenant>
  manage: boolean
  money: boolean
  onEditRoom: (r: Room) => void
  onEditRent: (b: Bed) => void
}

export function RoomsTab({ property }: { property: Property }) {
  const { can } = useSession()
  const manage = can('properties.manage')
  const money = can('rent.view')
  const allRooms = useDb((db) => db.rooms)
  const allBeds = useDb((db) => db.beds)
  const tenants = useDb((db) => db.tenants)

  const rooms = useMemo(
    () =>
      allRooms
        .filter((r) => r.propertyId === property.id)
        .sort((a, b) => compareRoomNumbers(a.number, b.number)),
    [allRooms, property.id],
  )
  const beds = useMemo(
    () => allBeds.filter((b) => b.propertyId === property.id),
    [allBeds, property.id],
  )
  const bedsOf = useMemo(() => {
    const m = new Map<string, Bed[]>()
    for (const b of beds) m.set(b.roomId, [...(m.get(b.roomId) ?? []), b])
    for (const list of m.values()) list.sort((a, b) => a.label.localeCompare(b.label))
    return m
  }, [beds])
  const tenantOf = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants])
  const floors = floorsOf(property, rooms)

  const [query, setQuery] = useState('')
  const [only, setOnly] = useState<number | 'all'>('all')
  const [freeOnly, setFreeOnly] = useState(false)
  const [view, setView] = useState<'list' | 'plan'>('list')
  const [adding, setAdding] = useState<QuickAddDefaults | null>(null)
  const [editRoom, setEditRoom] = useState<Room | null>(null)
  const [editBed, setEditBed] = useState<Bed | null>(null)
  const [importing, setImporting] = useState(false)
  const [floorsOpen, setFloorsOpen] = useState(false)

  const c = bedCounts(beds)
  const q = query.trim().toLowerCase()
  const groups = floors
    .filter((f) => only === 'all' || f === only)
    .map((f) => ({
      floor: f,
      rooms: rooms.filter(
        (r) =>
          r.floor === f &&
          (!q || r.number.toLowerCase().includes(q)) &&
          (!freeOnly || (bedsOf.get(r.id) ?? []).some((b) => b.status === 'vacant')),
      ),
    }))
    .filter((g) => g.rooms.length > 0 || (!q && !freeOnly))

  const usage: Record<number, number> = {}
  for (const r of rooms) usage[r.floor] = (usage[r.floor] ?? 0) + 1

  function addOn(floor: number) {
    setAdding({ floor, from: nextRoomNumber(floor, rooms) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const ctx: Ctx = {
    property,
    bedsOf,
    tenantOf,
    manage,
    money,
    onEditRoom: setEditRoom,
    onEditRent: setEditBed,
  }
  const editRoomBeds = editRoom ? (bedsOf.get(editRoom.id) ?? []).length : 0
  const editBedRoom = editBed ? rooms.find((r) => r.id === editBed.roomId) : undefined

  return (
    <div className="grid gap-4">
      {rooms.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Rooms" value={rooms.length} />
          <Stat label="Beds" value={c.total} />
          <Stat label="Filled" value={c.filled} tone="text-blue-700" hint={`${c.pct}% full`} />
          <Stat label="Free" value={c.vacant} tone="text-emerald-700" />
          <Stat
            label="Reserved"
            value={c.reserved}
            tone="text-amber-700"
            hint={c.blocked ? `${c.blocked} not available` : undefined}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {rooms.length > 0 && (
          <>
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Find a room, e.g. 204"
              className="max-w-xs"
            />
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {floors.length > 1 && (
                <>
                  <Pill on={only === 'all'} onClick={() => setOnly('all')}>
                    All floors
                  </Pill>
                  {floors.map((f) => (
                    <Pill key={f} on={only === f} onClick={() => setOnly(f)}>
                      {floorLabel(property, f)}
                    </Pill>
                  ))}
                </>
              )}
              <Pill
                on={freeOnly}
                onClick={() => setFreeOnly(!freeOnly)}
                className={cn(freeOnly && 'border-emerald-600 bg-emerald-600')}
              >
                Only free beds
              </Pill>
            </div>
          </>
        )}
        <span className="flex-1" />
        {rooms.length > 0 && (
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'List' },
              { value: 'plan', label: 'Floor plan' },
            ]}
          />
        )}
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload /> Upload CSV
            </Button>
            <Button variant="outline" onClick={() => setFloorsOpen(true)}>
              <Layers /> Floors
            </Button>
            <Button onClick={() => addOn(rooms.at(-1)?.floor ?? floors.find((f) => f > 0) ?? 1)}>
              <Plus /> Add rooms
            </Button>
          </div>
        )}
      </div>

      {rooms.length > 0 && <Legend />}

      {adding && (
        <QuickAddRooms
          key={`${adding.floor}-${adding.from}`}
          property={property}
          floors={floors}
          taken={new Set(rooms.map((r) => r.number.toLowerCase()))}
          defaults={adding}
          onClose={() => setAdding(null)}
        />
      )}

      {rooms.length === 0 ? (
        !adding && (
          <EmptyState
            icon={<BedSingle />}
            title="No rooms yet"
            actions={
              manage && (
                <>
                  <Button onClick={() => addOn(1)}>
                    <Plus /> Add rooms
                  </Button>
                  <Button variant="outline" onClick={() => setImporting(true)}>
                    <Upload /> Upload CSV
                  </Button>
                </>
              )
            }
          >
            Add your rooms with their sharing and rent per bed; the beds are made for you. You can
            add a whole floor at once, e.g. rooms 101 to 110.
          </EmptyState>
        )
      ) : groups.length === 0 ? (
        <EmptyState
          title="No rooms match"
          actions={
            <Button
              variant="outline"
              onClick={() => {
                setQuery('')
                setFreeOnly(false)
                setOnly('all')
              }}
            >
              Clear filters
            </Button>
          }
        >
          {freeOnly ? 'No room has a free bed right now.' : 'Try another room number.'}
        </EmptyState>
      ) : (
        groups.map((g) => {
          const gBeds = g.rooms.flatMap((r) => bedsOf.get(r.id) ?? [])
          const gc = bedCounts(gBeds)
          return (
            <Card key={g.floor} className="overflow-hidden" aria-labelledby={`floor-${g.floor}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/40 px-4 py-2.5 md:px-5">
                <h3 id={`floor-${g.floor}`} className="text-sm font-semibold">
                  {floorLabel(property, g.floor)}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {plural(g.rooms.length, 'room')}
                    {gBeds.length ? ` · ${plural(gBeds.length, 'bed')} · ${gc.vacant} free` : ''}
                  </span>
                </h3>
                {manage && (
                  <Button variant="outline" size="sm" onClick={() => addOn(g.floor)}>
                    <Plus /> Add room on {onFloorWords(floorLabel(property, g.floor))}
                  </Button>
                )}
              </div>
              {g.rooms.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-[13px] text-muted-foreground">
                  No rooms on this floor yet.
                  {manage && (
                    <Button size="sm" variant="link" onClick={() => addOn(g.floor)}>
                      Add the first room
                    </Button>
                  )}
                </div>
              ) : view === 'list' ? (
                g.rooms.map((r) => <RoomRow key={r.id} room={r} ctx={ctx} />)
              ) : (
                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:p-5 lg:grid-cols-4 xl:grid-cols-6">
                  {g.rooms.map((r) => (
                    <RoomTile key={r.id} room={r} ctx={ctx} />
                  ))}
                </div>
              )}
            </Card>
          )
        })
      )}

      {importing && (
        <ImportCsvDialog property={property} rooms={rooms} onClose={() => setImporting(false)} />
      )}
      {floorsOpen && (
        <FloorsDialog
          property={property}
          floors={floors}
          usage={usage}
          onClose={() => setFloorsOpen(false)}
        />
      )}
      {editRoom && (
        <EditRoomDialog
          key={editRoom.id}
          room={editRoom}
          property={property}
          floors={floors}
          bedCount={editRoomBeds}
          onClose={() => setEditRoom(null)}
        />
      )}
      {editBed && editBedRoom && (
        <BedRentDialog
          key={editBed.id}
          bed={editBed}
          room={editBedRoom}
          onClose={() => setEditBed(null)}
        />
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: number
  tone?: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
      <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', tone)}>{value}</p>
      <p className="text-xs text-muted-foreground">
        {label}
        {hint && <span> · {hint}</span>}
      </p>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(Object.keys(BED_STATUS) as Bed['status'][]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', BED_DOT[s])} />
          {BED_STATUS[s].label}
        </span>
      ))}
      <span className="hidden sm:inline">· Tap a bed to change it</span>
    </div>
  )
}

function onFloorWords(label: string) {
  return / floor$/i.test(label) ? label.toLowerCase() : label
}

function firstName(name: string) {
  const [a, b] = name.split(' ')
  return b ? `${a} ${b[0]}.` : a
}

function BedChip({ bed, room, ctx }: { bed: Bed; room: Room; ctx: Ctx }) {
  const tenant = bed.tenantId ? ctx.tenantOf.get(bed.tenantId) : undefined
  return (
    <BedMenu bed={bed} room={room} tenant={tenant} onEditRent={ctx.onEditRent}>
      <button
        type="button"
        aria-label={`Room ${room.number} bed ${bed.label}: ${BED_STATUS[bed.status].label}${tenant ? `, ${tenant.name}` : ''}`}
        className={cn(
          'min-w-[5.5rem] max-w-[9rem] rounded-lg border px-2.5 py-1.5 text-left transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
          BED_STYLE[bed.status],
        )}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={cn('size-1.5 rounded-full', BED_DOT[bed.status])} />
          Bed {bed.label}
        </span>
        <span className="block truncate text-[11px]">
          {tenant ? firstName(tenant.name) : BED_STATUS[bed.status].label}
        </span>
      </button>
    </BedMenu>
  )
}

function RoomTags({ room, money }: { room: Room; money: boolean }) {
  const tags = [
    room.sharing === 1 ? 'Single room' : `${room.sharing} sharing`,
    room.ac ? 'AC' : 'Non-AC',
    room.attachedBath ? 'Attached bath' : 'Common bath',
  ]
  if (room.letting === 'whole' && room.sharing > 1) tags.push('Whole room')
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className={cn(
            'rounded border bg-card px-1.5 text-[11px] text-foreground/80',
            t === 'AC' && 'border-sky-200 bg-sky-50 text-sky-800',
          )}
        >
          {t}
        </span>
      ))}
      {room.features.map((f) => (
        <span
          key={f.key}
          className={cn(
            'rounded border px-1.5 text-[11px]',
            f.extra ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-card text-muted-foreground',
          )}
        >
          {f.name}
          {f.extra && money ? ` +${formatMoney(f.extra)}` : ''}
        </span>
      ))}
    </div>
  )
}

function RoomRow({ room, ctx }: { room: Room; ctx: Ctx }) {
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const beds = ctx.bedsOf.get(room.id) ?? []
  const full = beds.length >= room.sharing
  const price = room.letting === 'whole' ? room.wholeRent : room.rentPerBed
  const filled = beds.filter((b) => b.status === 'occupied' || b.status === 'notice').length

  return (
    <div className="grid gap-3 border-b px-4 py-3.5 last:border-b-0 md:grid-cols-[minmax(12rem,16rem)_1fr_8rem_auto] md:items-center md:px-5">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 md:block">
          <p className="text-[15px] font-bold">Room {room.number}</p>
          <p className="text-xs text-muted-foreground md:hidden">
            {filled} of {beds.length} filled
          </p>
        </div>
        <RoomTags room={room} money={ctx.money} />
      </div>

      <div className="min-w-0">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            <span className="min-w-0 flex-1">
              {problem ?? (
                <>
                  Delete room {room.number}
                  {beds.length ? ` and its ${plural(beds.length, 'bed')}` : ''}?
                </>
              )}
            </span>
            {!problem && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  const err = deleteRoom(room, ctx.property.name)
                  if (err) setProblem(err)
                  else setConfirming(false)
                }}
              >
                Yes, delete
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirming(false)
                setProblem(null)
              }}
            >
              {problem ? 'OK' : 'Cancel'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {beds.map((b) => (
              <BedChip key={b.id} bed={b} room={room} ctx={ctx} />
            ))}
            {ctx.manage && !full && (
              <button
                type="button"
                className="inline-flex min-w-[5.5rem] items-center justify-center gap-1 rounded-lg border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:bg-accent hover:text-primary"
                onClick={() => addBed(room)}
              >
                <Plus className="size-3.5" /> Add bed
              </button>
            )}
            {beds.length === 0 && !ctx.manage && (
              <span className="text-[13px] text-amber-700">No beds yet.</span>
            )}
          </div>
        )}
      </div>

      {ctx.money ? (
        <p className="text-[13px] tabular-nums md:text-right">
          <span className="font-semibold">{price ? formatMoney(price) : 'No rent set'}</span>
          {price ? (
            <span className="text-muted-foreground">
              {' '}
              / {room.letting === 'whole' ? 'room' : 'bed'}
            </span>
          ) : null}
        </p>
      ) : (
        <span className="hidden md:block" />
      )}

      {ctx.manage && (
        <div className="flex gap-1.5 md:justify-end">
          <Button
            size="sm"
            variant="outline"
            aria-label={`Edit room ${room.number}`}
            onClick={() => ctx.onEditRoom(room)}
          >
            <Pencil /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            aria-label={`Delete room ${room.number}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 /> Delete
          </Button>
        </div>
      )}
    </div>
  )
}

function RoomTile({ room, ctx }: { room: Room; ctx: Ctx }) {
  const beds = ctx.bedsOf.get(room.id) ?? []
  const free = beds.filter((b) => b.status === 'vacant').length
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border-2 bg-card p-3 shadow-xs',
        free > 0 ? 'border-emerald-200' : beds.length ? 'border-blue-100' : 'border-dashed',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="text-base leading-tight font-bold">{room.number}</p>
          <p className="text-[11px] text-muted-foreground">
            {room.sharing === 1 ? 'Single' : `${room.sharing} sharing`}
            {room.ac ? ' · AC' : ''}
          </p>
        </div>
        {ctx.manage && (
          <button
            type="button"
            aria-label={`Edit room ${room.number}`}
            onClick={() => ctx.onEditRoom(room)}
            className="-m-1 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {beds.map((b) => {
          const tenant = b.tenantId ? ctx.tenantOf.get(b.tenantId) : undefined
          return (
            <BedMenu key={b.id} bed={b} room={room} tenant={tenant} onEditRent={ctx.onEditRent}>
              <button
                type="button"
                title={`Bed ${b.label}: ${tenant?.name ?? BED_STATUS[b.status].label}`}
                aria-label={`Room ${room.number} bed ${b.label}: ${BED_STATUS[b.status].label}`}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-offset-1 transition hover:ring-2 hover:ring-ring/40',
                  BED_DOT[b.status],
                  b.status === 'blocked' && 'text-slate-600',
                )}
              >
                {b.label}
              </button>
            </BedMenu>
          )
        })}
        {beds.length === 0 && <span className="text-[11px] text-amber-700">No beds</span>}
      </div>
      <p
        className={cn(
          'mt-auto pt-2 text-[11px] font-medium',
          free ? 'text-emerald-700' : 'text-muted-foreground',
        )}
      >
        {beds.length ? (free ? `${free} free` : 'Full') : ''}
      </p>
    </div>
  )
}
