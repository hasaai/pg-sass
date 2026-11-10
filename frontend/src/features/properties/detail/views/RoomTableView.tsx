/** Second view: every room in one table, with search, filters and row actions. */
import { BedDouble, ChevronRight, Pencil, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../../api/client'
import { useApiMutation } from '../../../../api/hooks'
import type { Floor, Property, RentalUnit, Room } from '../../../../api/types'
import { Badge } from '../../../../components/ui-kit/badge'
import { Button } from '../../../../components/ui-kit/button'
import { Card } from '../../../../components/ui-kit/card'
import { Segmented } from '../../../../components/ui-kit/choice-cards'
import { Input, NativeSelect } from '../../../../components/ui-kit/input'
import { Table, TBody, TD, TH, THead, TR } from '../../../../components/ui-kit/table'
import { toast } from '../../../../components/ui-kit/toast'
import { cn } from '../../../../lib/cn'
import { formatMoney, plural } from '../../../../lib/format'
import { PROPERTY_QUERIES } from '../../api'
import { RoomDialog } from '../dialogs'
import { BedChip } from '../roomParts'
import { bedState, countRooms } from '../roomStats'
import type { FloorSummary, StayIndex } from '../roomStats'

type Filter = 'all' | 'vacancy' | 'full' | 'maintenance'

function roomStatus(room: Room, stays?: StayIndex) {
  if (room.letting === 'whole')
    return stays?.byRoom.get(room.id)
      ? ({ label: 'Rented', tone: 'info' } as const)
      : ({ label: 'Has vacancy', tone: 'good' } as const)
  if (room.beds.length === 0) return { label: 'No beds yet', tone: 'warn' } as const
  const c = countRooms([room], stays)
  if (c.blocked === c.beds) return { label: 'Under maintenance', tone: 'neutral' } as const
  if (c.vacant > 0) return { label: 'Has vacancy', tone: 'good' } as const
  if (c.blocked > 0) return { label: 'Part maintenance', tone: 'neutral' } as const
  return { label: 'Full', tone: 'info' } as const
}

function RoomRowActions({
  room,
  onOpen,
  onEdit,
}: {
  room: Room
  onOpen: () => void
  onEdit: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const archive = useApiMutation(() => api.post(`/rooms/${room.id}/archive/`), PROPERTY_QUERIES)
  if (confirming)
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-red-600/15 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
        <span>
          Delete room {room.number}
          {room.beds.length ? ` and its ${plural(room.beds.length, 'bed')}` : ''}? Its history is
          kept.
        </span>
        <Button
          size="sm"
          variant="destructive"
          busy={archive.isPending}
          onClick={() =>
            archive.mutate(undefined, {
              onSuccess: () => toast.success(`Room ${room.number} deleted`),
              onError: (e) => toast.error(e.message),
              onSettled: () => setConfirming(false),
            })
          }
        >
          Yes, delete
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    )
  return (
    <div className="flex justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={onOpen}
        aria-label={`Open beds of room ${room.number}`}
      >
        <BedDouble /> Beds
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Edit room ${room.number}`}
        onClick={onEdit}
      >
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:bg-red-50"
        aria-label={`Delete room ${room.number}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 />
      </Button>
    </div>
  )
}

export function RoomTableView({
  summaries,
  rooms,
  stays,
  canManage,
  showMoney,
  onOpenRoom,
  property,
  floors,
  units,
}: {
  summaries: FloorSummary[]
  rooms: Room[]
  stays?: StayIndex
  canManage: boolean
  showMoney: boolean
  onOpenRoom: (id: string) => void
  property: Property
  floors: Floor[]
  units: RentalUnit[]
}) {
  const [query, setQuery] = useState('')
  const [floorKey, setFloorKey] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [freeOnly, setFreeOnly] = useState(false)
  const [editing, setEditing] = useState<Room | null>(null)

  const withRooms = summaries.filter((s) => s.rooms.length > 0)
  const floorOf = new Map(withRooms.flatMap((s) => s.rooms.map((r) => [r.id, s.title] as const)))
  const q = query.trim().toLowerCase()
  const visible = withRooms
    .filter((s) => !floorKey || s.key === floorKey)
    .flatMap((s) => s.rooms)
    .filter((r) => {
      const c = countRooms([r], stays)
      if (q && !r.number.toLowerCase().includes(q)) return false
      if (freeOnly && c.vacant === 0 && !(r.letting === 'whole' && !stays?.byRoom.get(r.id)))
        return false
      if (filter === 'vacancy')
        return c.vacant > 0 || (r.letting === 'whole' && !stays?.byRoom.get(r.id))
      if (filter === 'full') return c.beds > 0 && c.vacant === 0 && c.blocked === 0
      if (filter === 'maintenance') return c.blocked > 0
      return true
    })
  const ordered = [...visible].sort((a, b) => {
    const fa = floors.find((f) => f.id === a.floor)?.number ?? 999
    const fb = floors.find((f) => f.id === b.floor)?.number ?? 999
    return fa - fb || a.number.localeCompare(b.number, undefined, { numeric: true })
  })

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative min-w-44 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            className="pl-8"
            placeholder="Find a room, e.g. 204"
            aria-label="Find a room"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <NativeSelect
          aria-label="Floor"
          className="w-auto min-w-36"
          value={floorKey}
          onChange={(e) => setFloorKey(e.target.value)}
        >
          <option value="">All floors</option>
          {withRooms.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
        </NativeSelect>
        <Segmented<Filter>
          label="Room status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'vacancy', label: 'Has vacancy' },
            { value: 'full', label: 'Full' },
            { value: 'maintenance', label: 'Maintenance' },
          ]}
        />
        <button
          type="button"
          aria-pressed={freeOnly}
          onClick={() => setFreeOnly(!freeOnly)}
          className={cn(
            'h-9 rounded-lg border px-3 text-[13px] font-medium transition-colors',
            freeOnly
              ? 'border-primary bg-primary-soft text-accent-foreground'
              : 'bg-card hover:bg-secondary',
          )}
        >
          Only free beds
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
          No rooms match. Clear the search or filters.
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Room</TH>
                  <TH>Floor</TH>
                  <TH>Beds</TH>
                  <TH className="text-right">Occupied</TH>
                  {showMoney && <TH className="text-right">Rent</TH>}
                  <TH>Status</TH>
                  {canManage && <TH className="text-right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {ordered.map((r) => {
                  const c = countRooms([r], stays)
                  const st = roomStatus(r, stays)
                  const rent = r.letting === 'whole' ? r.monthly_rent : r.beds[0]?.monthly_rent
                  return (
                    <TR key={r.id}>
                      <TD>
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => onOpenRoom(r.id)}
                        >
                          <span className="block font-semibold hover:underline">
                            Room {r.number}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {r.sharing === 1 ? r.room_type_label : `${r.sharing} sharing`}
                            {r.is_ac ? ' · AC' : ''}
                            {r.has_attached_bath ? ' · Attached bath' : ''}
                          </span>
                          {(r.features ?? []).some((f) => f.charge === 'extra') && showMoney && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {(r.features ?? [])
                                .filter((f) => f.charge === 'extra')
                                .map((f) => (
                                  <Badge key={f.amenity} tone="info">
                                    {f.name} +{formatMoney(f.charge_amount ?? 0)}
                                  </Badge>
                                ))}
                            </span>
                          )}
                        </button>
                      </TD>
                      <TD className="text-muted-foreground">{floorOf.get(r.id)}</TD>
                      <TD>
                        {r.letting === 'whole' ? (
                          <span className="text-xs text-muted-foreground">Whole room</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.beds.map((b) => (
                              <BedChip
                                key={b.id}
                                bed={b}
                                room={r}
                                state={bedState(b, stays)}
                                canManage={canManage}
                              />
                            ))}
                          </div>
                        )}
                      </TD>
                      <TD className="text-right">
                        {r.letting === 'whole' ? '—' : `${c.occupied + c.notice}/${c.beds}`}
                      </TD>
                      {showMoney && (
                        <TD className="text-right whitespace-nowrap">
                          {rent ? formatMoney(rent) : '—'}
                          <span className="text-xs text-muted-foreground">
                            {rent ? (r.letting === 'whole' ? ' /room' : ' /bed') : ''}
                          </span>
                        </TD>
                      )}
                      <TD>
                        <Badge tone={st.tone} dot>
                          {st.label}
                        </Badge>
                      </TD>
                      {canManage && (
                        <TD className="min-w-48">
                          <RoomRowActions
                            room={r}
                            onOpen={() => onOpenRoom(r.id)}
                            onEdit={() => setEditing(r)}
                          />
                        </TD>
                      )}
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
          <ul className="divide-y md:hidden">
            {ordered.map((r) => {
              const c = countRooms([r], stays)
              const st = roomStatus(r, stays)
              return (
                <li key={r.id} className="grid gap-2 px-4 py-3">
                  <button
                    type="button"
                    className="flex items-center justify-between gap-2 text-left"
                    onClick={() => onOpenRoom(r.id)}
                  >
                    <span>
                      <span className="block text-[14px] font-semibold">Room {r.number}</span>
                      <span className="block text-xs text-muted-foreground">
                        {floorOf.get(r.id)} ·{' '}
                        {r.sharing === 1 ? r.room_type_label : `${r.sharing} sharing`}
                        {r.letting === 'whole'
                          ? ''
                          : ` · ${c.occupied + c.notice}/${c.beds} occupied`}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                      <ChevronRight className="size-4 text-subtle-foreground" />
                    </span>
                  </button>
                  {canManage && (
                    <RoomRowActions
                      room={r}
                      onOpen={() => onOpenRoom(r.id)}
                      onEdit={() => setEditing(r)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
          <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
            {plural(ordered.length, 'room')} shown of {rooms.length}
          </p>
        </>
      )}
      {editing && (
        <RoomDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          property={property}
          floors={floors}
          units={units}
          room={editing}
        />
      )}
    </Card>
  )
}
