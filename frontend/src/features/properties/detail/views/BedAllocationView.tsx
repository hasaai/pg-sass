/** Room → beds → tenant: the detailed, day-to-day view of one room. */
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  CalendarClock,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Snowflake,
  UserPlus,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { Floor, Property, RentalUnit, Room, Stay } from '../../../../api/types'
import { Badge } from '../../../../components/ui-kit/badge'
import { Button } from '../../../../components/ui-kit/button'
import { Card } from '../../../../components/ui-kit/card'
import { EmptyState } from '../../../../components/ui-kit/feedback'
import { NativeSelect } from '../../../../components/ui-kit/input'
import { Menu, MenuContent, MenuTrigger } from '../../../../components/ui-kit/menu'
import { cn } from '../../../../lib/cn'
import { formatDate, formatMoney, initials } from '../../../../lib/format'
import { BedDialog, RoomDialog } from '../dialogs'
import { BedDialogs, BedMenuItems, StateBar } from '../roomParts'
import { useBedStatus } from '../useBedStatus'
import { BED_STATE, bedState, countRooms } from '../roomStats'
import type { FloorSummary, StayIndex } from '../roomStats'

type Bed = Room['beds'][number]

function TenantBlock({ stay, showMoney }: { stay: Stay; showMoney: boolean }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[13px] font-semibold text-sky-800">
          {initials(stay.tenant.full_name)}
        </span>
        <div className="min-w-0">
          <Link
            to={`/app/tenants/${stay.tenant.id}`}
            className="block truncate text-[14px] font-semibold text-foreground no-underline hover:underline"
          >
            {stay.tenant.full_name}
          </Link>
          <a
            href={`tel:${stay.tenant.phone}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
          >
            <Phone className="size-3" /> {stay.tenant.phone}
          </a>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-secondary/60 px-2.5 py-2">
          <dt className="text-muted-foreground">Moved in</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{formatDate(stay.check_in)}</dd>
        </div>
        {showMoney ? (
          <div className="rounded-md bg-secondary/60 px-2.5 py-2">
            <dt className="text-muted-foreground">Pays</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{formatMoney(stay.monthly_rent)}/mo</dd>
          </div>
        ) : (
          <div className="rounded-md bg-secondary/60 px-2.5 py-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-0.5 font-medium">{stay.status_label}</dd>
          </div>
        )}
      </dl>
      {stay.status === 'notice' && stay.expected_checkout && (
        <p className="flex items-center gap-1.5 rounded-md border border-orange-500/25 bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-900">
          <CalendarClock className="size-3.5" /> Leaving on {formatDate(stay.expected_checkout)}
        </p>
      )}
    </div>
  )
}

function BedCard({
  bed,
  room,
  stays,
  canManage,
  canSeeTenants,
  showMoney,
}: {
  bed: Bed
  room: Room
  stays?: StayIndex
  canManage: boolean
  canSeeTenants: boolean
  showMoney: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const setStatus = useBedStatus(bed)
  const state = bedState(bed, stays)
  const s = BED_STATE[state]
  const stay = stays?.byBed.get(bed.id)
  return (
    <article
      aria-label={`Bed ${bed.label}`}
      className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs"
    >
      <header
        className={cn('flex items-center justify-between gap-2 border-b px-4 py-2.5', s.tile)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold">Bed {bed.label}</span>
          {showMoney && (
            <span className="text-xs opacity-80 tabular-nums">
              {formatMoney(bed.monthly_rent)}/mo
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Badge tone={s.tone} dot className="bg-card">
            {s.label}
          </Badge>
          {canManage && (
            <Menu>
              <MenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:bg-card/70"
                  aria-label={`Bed ${bed.label} in room ${room.number}: ${s.label}`}
                >
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <BedMenuItems
                  bed={bed}
                  onEdit={() => setEditing(true)}
                  onRemove={() => setRemoving(true)}
                />
              </MenuContent>
            </Menu>
          )}
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {(state === 'occupied' || state === 'notice') &&
          (stay && canSeeTenants ? (
            <TenantBlock stay={stay} showMoney={showMoney} />
          ) : (
            <p className="text-[13px] text-muted-foreground">A tenant stays here.</p>
          ))}
        {state === 'vacant' && (
          <>
            <p className="text-[13px] text-muted-foreground">Ready for a tenant.</p>
            {canManage && (
              <Button variant="outline" size="sm" asChild className="mt-auto w-full">
                <Link to="/app/tenants">
                  <UserPlus /> Check in a tenant
                </Link>
              </Button>
            )}
          </>
        )}
        {state === 'reserved' && (
          <>
            <p className="text-[13px] text-muted-foreground">Held for someone moving in.</p>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                className="mt-auto w-full"
                onClick={() => setStatus('vacant')}
              >
                Release the bed
              </Button>
            )}
          </>
        )}
        {state === 'blocked' && (
          <>
            <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <Wrench className="mt-0.5 size-3.5 shrink-0" /> Under maintenance. Not counted as
              available and can’t take a tenant.
            </p>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                className="mt-auto w-full"
                onClick={() => setStatus('vacant')}
              >
                Maintenance done: mark available
              </Button>
            )}
          </>
        )}
      </div>
      <BedDialogs
        bed={bed}
        room={room}
        editing={editing}
        setEditing={setEditing}
        removing={removing}
        setRemoving={setRemoving}
      />
    </article>
  )
}

export function BedAllocationView({
  rooms,
  room,
  floor,
  onSelectRoom,
  onBackToFloor,
  onBackToBuilding,
  stays,
  canManage,
  canSeeTenants,
  showMoney,
  property,
  floors,
  units,
}: {
  rooms: Room[]
  room: Room | undefined
  floor: FloorSummary | undefined
  onSelectRoom: (id: string) => void
  onBackToFloor: () => void
  onBackToBuilding: () => void
  stays?: StayIndex
  canManage: boolean
  canSeeTenants: boolean
  showMoney: boolean
  property: Property
  floors: Floor[]
  units: RentalUnit[]
}) {
  const [editing, setEditing] = useState(false)
  const [addingBed, setAddingBed] = useState(false)
  const ordered = [...rooms].sort((a, b) => {
    const fa = floors.find((f) => f.id === a.floor)?.number ?? 999
    const fb = floors.find((f) => f.id === b.floor)?.number ?? 999
    return fa - fb || a.number.localeCompare(b.number, undefined, { numeric: true })
  })
  if (!room)
    return (
      <EmptyState title="Pick a room" icon={<ChevronRight />}>
        Choose a room on the floor layout or from the list to see its beds and tenants.
      </EmptyState>
    )
  const idx = ordered.findIndex((r) => r.id === room.id)
  const prev = ordered[idx - 1]
  const next = ordered[idx + 1]
  const counts = countRooms([room], stays)
  const whole = room.letting === 'whole'
  const wholeStay = whole ? stays?.byRoom.get(room.id) : undefined
  const unit = units.find((u) => u.id === room.unit)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 text-[13px]">
          <button
            type="button"
            className="rounded px-1 text-muted-foreground hover:text-foreground"
            onClick={onBackToBuilding}
          >
            Building
          </button>
          <ChevronRight className="size-3.5 text-subtle-foreground" />
          <button
            type="button"
            className="rounded px-1 text-muted-foreground hover:text-foreground"
            onClick={onBackToFloor}
          >
            {floor?.title ?? 'No floor set'}
          </button>
          <ChevronRight className="size-3.5 text-subtle-foreground" />
          <span className="px-1 font-medium" aria-current="page">
            Room {room.number}
          </span>
        </nav>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous room"
            disabled={!prev}
            onClick={() => prev && onSelectRoom(prev.id)}
          >
            <ArrowLeft />
          </Button>
          <NativeSelect
            aria-label="Room"
            className="w-44"
            value={room.id}
            onChange={(e) => onSelectRoom(e.target.value)}
          >
            {ordered.map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.number}
                {r.floor_label ? ` · ${r.floor_label}` : ''}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next room"
            disabled={!next}
            onClick={() => next && onSelectRoom(next.id)}
          >
            <ArrowRight />
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Room {room.number}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="outline">
                {room.sharing === 1 ? room.room_type_label : `${room.sharing} sharing`}
              </Badge>
              <Badge tone="outline">{whole ? 'Whole room' : 'Bed by bed'}</Badge>
              {unit && <Badge tone="outline">{unit.code}</Badge>}
              {room.is_ac && (
                <Badge tone="outline">
                  <Snowflake /> AC
                </Badge>
              )}
              {room.has_attached_bath && (
                <Badge tone="outline">
                  <Bath /> Attached bath
                </Badge>
              )}
              {(room.features ?? []).map((f) => (
                <Badge key={f.amenity} tone={f.charge === 'extra' ? 'info' : 'outline'}>
                  {f.name}
                  {f.charge === 'extra' && f.charge_amount && showMoney
                    ? ` +${formatMoney(f.charge_amount)}`
                    : ''}
                </Badge>
              ))}
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {!whole && room.beds.length < room.sharing && (
                <Button variant="outline" onClick={() => setAddingBed(true)}>
                  <Plus /> Add bed
                </Button>
              )}
              <Button
                variant="outline"
                aria-label={`Edit room ${room.number}`}
                onClick={() => setEditing(true)}
              >
                <Pencil /> Edit room
              </Button>
            </div>
          )}
        </div>
        {!whole && room.beds.length > 0 && (
          <div className="grid gap-2 border-t px-5 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <StateBar counts={counts} />
            <p className="text-xs text-muted-foreground tabular-nums">
              {counts.occupied + counts.notice} of {counts.beds} occupied · {counts.vacant} vacant
              {counts.blocked ? ` · ${counts.blocked} under maintenance` : ''}
            </p>
          </div>
        )}
      </Card>

      {whole ? (
        <Card className="max-w-md p-4">
          <p className="mb-3 text-[14px] font-semibold">Whole room</p>
          {wholeStay && canSeeTenants ? (
            <TenantBlock stay={wholeStay} showMoney={showMoney} />
          ) : wholeStay ? (
            <p className="text-[13px] text-muted-foreground">A tenant rents this room.</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Free.{' '}
              {showMoney && room.monthly_rent ? `${formatMoney(room.monthly_rent)} a month. ` : ''}
              Check a tenant into the whole room from the Tenants page.
            </p>
          )}
        </Card>
      ) : room.beds.length === 0 ? (
        <EmptyState
          title="This room has no beds yet"
          actions={
            canManage && (
              <Button onClick={() => setAddingBed(true)}>
                <Plus /> Add bed
              </Button>
            )
          }
        >
          Room {room.number} is rented bed by bed; add its beds so tenants can be checked in.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {room.beds.map((b) => (
            <BedCard
              key={b.id}
              bed={b}
              room={room}
              stays={stays}
              canManage={canManage}
              canSeeTenants={canSeeTenants}
              showMoney={showMoney}
            />
          ))}
        </div>
      )}

      {editing && (
        <RoomDialog
          open
          onOpenChange={setEditing}
          property={property}
          floors={floors}
          units={units}
          room={room}
        />
      )}
      {addingBed && <BedDialog open onOpenChange={setAddingBed} room={room} />}
    </div>
  )
}
