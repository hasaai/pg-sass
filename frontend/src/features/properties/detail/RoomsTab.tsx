/**
 * Rooms & beds. Four views over the same rooms, beds and tenants:
 *   Floor layout (default) → Room table → Bed allocation → Maintenance & adjustments.
 * Building → floor → room → beds → tenant: clicking a floor shows its rooms, clicking a room
 * opens its beds. The view, floor and room live in the URL (?view=&floor=&room=).
 */
import {
  BedSingle,
  LayoutGrid,
  Layers,
  Plus,
  Rows3,
  SlidersHorizontal,
  Upload,
  UsersRound,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { useList } from '../../../api/hooks'
import type { Floor, Property, RentalUnit, Room, Stay } from '../../../api/types'
import { Button } from '../../../components/ui-kit/button'
import { EmptyState } from '../../../components/ui-kit/feedback'
import { cn } from '../../../lib/cn'
import { typeInfo } from '../propertyTypes'
import { FloorsDialog } from './dialogs'
import { ImportRoomsDialog } from './ImportRoomsDialog'
import { QuickAddRooms, type QuickAddDefaults } from './QuickAddRooms'
import { SummaryStrip } from './roomParts'
import { nextRoomNumber } from './rooms'
import { countRooms, floorSummaries, indexStays } from './roomStats'
import type { FloorSummary } from './roomStats'
import { BedAllocationView } from './views/BedAllocationView'
import { FloorLayoutView } from './views/FloorLayoutView'
import { MaintenanceView } from './views/MaintenanceView'
import { RoomTableView } from './views/RoomTableView'

export type RoomsView = 'layout' | 'table' | 'beds' | 'maintenance'

const VIEWS: { value: RoomsView; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: 'layout', label: 'Floor layout', icon: LayoutGrid },
  { value: 'table', label: 'Room table', icon: Rows3 },
  { value: 'beds', label: 'Bed allocation', icon: UsersRound },
  { value: 'maintenance', label: 'Maintenance & adjustments', icon: SlidersHorizontal },
]

function ViewSwitch({ value, onChange }: { value: RoomsView; onChange: (v: RoomsView) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Rooms & beds view"
      className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-secondary p-0.5 [scrollbar-width:none]"
    >
      {VIEWS.map((v) => (
        <button
          key={v.value}
          type="button"
          role="tab"
          aria-selected={value === v.value}
          onClick={() => onChange(v.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
            value === v.value
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <v.icon className="size-3.5" />
          {v.label}
        </button>
      ))}
    </div>
  )
}

export function RoomsTab({
  property,
  floors,
  units,
  rooms,
  canManage,
  canSeeTenants = false,
  showMoney = true,
}: {
  property: Property
  floors: Floor[]
  units: RentalUnit[]
  rooms: Room[]
  canManage: boolean
  /** Show who lives in each bed (needs tenants.view). */
  canSeeTenants?: boolean
  /** Show rents (rent.view or properties.manage). */
  showMoney?: boolean
}) {
  const info = typeInfo(property.property_type)
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState<QuickAddDefaults | null>(null)
  const [floorsOpen, setFloorsOpen] = useState(false)
  const [importing, setImporting] = useState(false)

  // Who lives where (active and leaving soon), so beds can show their tenant.
  const active = useList<Stay>(canSeeTenants ? '/stays/' : null, {
    property: property.id,
    status: 'active',
  })
  const notice = useList<Stay>(canSeeTenants ? '/stays/' : null, {
    property: property.id,
    status: 'notice',
  })
  const stays = canSeeTenants ? indexStays([...active.rows, ...notice.rows]) : undefined

  const summaries = floorSummaries(rooms, floors, property.total_floors, stays)
  const counts = countRooms(rooms, stays)
  const view = (
    VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : 'layout'
  ) as RoomsView
  const roomId = params.get('room')
  const room = rooms.find((r) => r.id === roomId) ?? (view === 'beds' ? rooms[0] : undefined)
  const floorOfRoom = (r?: Room) => summaries.find((s) => s.rooms.some((x) => x.id === r?.id))
  const selectedFloor =
    summaries.find((s) => s.key === params.get('floor')) ??
    floorOfRoom(room) ??
    summaries.find((s) => s.rooms.length > 0) ??
    summaries[0]

  function go(next: Partial<Record<'view' | 'floor' | 'room', string | null>>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    setParams(p, { replace: true })
  }

  const usage: Record<string, number> = {}
  for (const r of rooms) if (r.floor) usage[r.floor] = (usage[r.floor] ?? 0) + 1
  for (const u of units) if (u.floor) usage[u.floor] = (usage[u.floor] ?? 0) + 1

  function addOnFloor(f: FloorSummary | undefined) {
    const n = f?.number ?? null
    const base = n === null ? '101' : n === 0 ? 'G01' : `${n}01`
    setAdding({
      floor: n ?? undefined,
      from: nextRoomNumber(f?.rooms ?? rooms, base === 'G01' ? '1' : base),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="grid gap-5">
      {rooms.length > 0 && <SummaryStrip counts={counts} showMoney={showMoney} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {rooms.length > 0 ? (
          <ViewSwitch value={view} onChange={(v) => go({ view: v === 'layout' ? null : v })} />
        ) : (
          <span />
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload /> Upload CSV
            </Button>
            <Button variant="outline" onClick={() => setFloorsOpen(true)}>
              <Layers /> Floors
            </Button>
            <Button
              onClick={() =>
                addOnFloor(
                  rooms.length === 0
                    ? (summaries.find((f) => f.number === 1) ?? summaries.at(-1))
                    : view === 'layout' && selectedFloor?.key !== 'none'
                      ? selectedFloor
                      : summaries.find((f) => f.rooms.length > 0 && f.key !== 'none'),
                )
              }
            >
              <Plus /> Add rooms
            </Button>
          </div>
        )}
      </div>

      {adding && (
        <QuickAddRooms
          key={`${adding.floor}-${adding.unit}-${adding.from}`}
          property={property}
          floors={floors}
          units={units}
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
              canManage && (
                <Button onClick={() => setAdding({ from: '101' })}>
                  <Plus /> Add rooms
                </Button>
              )
            }
          >
            {info.sharedLiving
              ? 'Add your rooms with their sharing and rent per bed; the beds are made for you. You can add many rooms at once.'
              : `Rooms are optional for ${info.label.toLowerCase()}s. Add them when you rent ${info.unitWord ? `a ${info.unitWord.toLowerCase()}` : 'it'} room by room.`}
          </EmptyState>
        )
      ) : view === 'layout' ? (
        <FloorLayoutView
          summaries={summaries}
          selected={selectedFloor}
          onSelect={(key) => go({ floor: key, room: null })}
          onOpenRoom={(id) => go({ view: 'beds', room: id, floor: null })}
          onAddOnFloor={addOnFloor}
          stays={stays}
          canManage={canManage}
          showMoney={showMoney}
        />
      ) : view === 'table' ? (
        <RoomTableView
          summaries={summaries}
          rooms={rooms}
          stays={stays}
          canManage={canManage}
          showMoney={showMoney}
          onOpenRoom={(id) => go({ view: 'beds', room: id })}
          property={property}
          floors={floors}
          units={units}
        />
      ) : view === 'beds' ? (
        <BedAllocationView
          rooms={rooms}
          room={room}
          floor={floorOfRoom(room)}
          onSelectRoom={(id) => go({ room: id })}
          onBackToFloor={() =>
            go({ view: null, floor: floorOfRoom(room)?.key ?? null, room: null })
          }
          onBackToBuilding={() => go({ view: null, floor: null, room: null })}
          stays={stays}
          canManage={canManage}
          canSeeTenants={canSeeTenants}
          showMoney={showMoney}
          property={property}
          floors={floors}
          units={units}
        />
      ) : (
        <MaintenanceView
          summaries={summaries}
          rooms={rooms}
          stays={stays}
          canManage={canManage}
          showMoney={showMoney}
        />
      )}

      <ImportRoomsDialog open={importing} onOpenChange={setImporting} property={property} />
      {floorsOpen && (
        <FloorsDialog
          open
          onOpenChange={setFloorsOpen}
          property={property}
          floors={floors}
          usage={usage}
        />
      )}
    </div>
  )
}
