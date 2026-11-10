/** Default view: the building's floors (top floor first) → the chosen floor's rooms as tiles. */
import { Bath, Building2, ChevronRight, Plus, Snowflake, Wrench } from 'lucide-react'

import type { Room } from '../../../../api/types'
import { Badge } from '../../../../components/ui-kit/badge'
import { Button } from '../../../../components/ui-kit/button'
import { Card } from '../../../../components/ui-kit/card'
import { EmptyState } from '../../../../components/ui-kit/feedback'
import { cn } from '../../../../lib/cn'
import { formatMoney, plural } from '../../../../lib/format'
import { StateBar, StatusLegend } from '../roomParts'
import { BED_STATE, bedState } from '../roomStats'
import type { FloorSummary, StayIndex } from '../roomStats'

function FloorButton({
  f,
  active,
  onClick,
}: {
  f: FloorSummary
  active: boolean
  onClick: () => void
}) {
  const c = f.counts
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${f.title}: ${plural(c.rooms, 'room')}, ${c.occupied + c.notice} occupied, ${c.vacant} vacant${c.blocked ? `, ${c.blocked} under maintenance` : ''}`}
      className={cn(
        'group grid w-full gap-2 rounded-lg border px-3.5 py-3 text-left transition-[border-color,background-color,box-shadow] duration-150',
        active
          ? 'border-primary/50 bg-primary-soft/60 shadow-xs ring-1 ring-primary/20'
          : 'bg-card hover:border-border-strong hover:shadow-xs',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums',
              active
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground',
            )}
            aria-hidden
          >
            {f.number === null ? '–' : f.number === 0 ? 'G' : f.number}
          </span>
          <span className="text-[14px] font-semibold">{f.title}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {c.blocked > 0 && (
            <Badge tone="neutral">
              <Wrench /> {c.blocked}
            </Badge>
          )}
          <ChevronRight
            className={cn(
              'size-4 text-subtle-foreground transition-transform',
              active ? 'translate-x-0.5 text-primary' : 'group-hover:translate-x-0.5',
            )}
          />
        </span>
      </div>
      {c.rooms === 0 ? (
        <p className="text-xs text-muted-foreground">No rooms yet</p>
      ) : (
        <>
          <dl className="grid grid-cols-4 gap-1 text-xs">
            {[
              ['Rooms', c.rooms, ''],
              ['Occupied', c.occupied + c.notice, 'text-sky-700'],
              ['Vacant', c.vacant, 'text-emerald-700'],
              ['Maint.', c.blocked, c.blocked ? 'text-slate-700' : 'text-subtle-foreground'],
            ].map(([k, v, tone]) => (
              <div key={k as string}>
                <dt className="text-[11px] text-muted-foreground">{k}</dt>
                <dd className={cn('font-semibold tabular-nums', tone as string)}>{v}</dd>
              </div>
            ))}
          </dl>
          <StateBar counts={c} />
        </>
      )}
    </button>
  )
}

function RoomTile({
  room,
  stays,
  showMoney,
  onOpen,
}: {
  room: Room
  stays?: StayIndex
  showMoney: boolean
  onOpen: () => void
}) {
  const whole = room.letting === 'whole'
  const wholeStay = whole ? stays?.byRoom.get(room.id) : undefined
  const states = room.beds.map((b) => bedState(b, stays))
  const occupied = states.filter((s) => s === 'occupied' || s === 'notice').length
  const blocked = states.filter((s) => s === 'blocked').length
  const rent = whole ? room.monthly_rent : room.beds[0]?.monthly_rent
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open room ${room.number}`}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.01em]">Room {room.number}</p>
          <p className="text-xs text-muted-foreground">
            {room.sharing === 1 ? room.room_type_label : `${room.sharing} sharing`}
            {whole ? ' · Whole room' : ''}
          </p>
        </div>
        <span className="flex gap-1 text-subtle-foreground">
          {room.is_ac && <Snowflake className="size-3.5" aria-label="AC" />}
          {room.has_attached_bath && <Bath className="size-3.5" aria-label="Attached bathroom" />}
        </span>
      </div>

      {whole ? (
        <span
          className={cn(
            'rounded-md border px-2 py-1.5 text-xs font-medium',
            BED_STATE[
              wholeStay ? (wholeStay.status === 'notice' ? 'notice' : 'occupied') : 'vacant'
            ].tile,
          )}
        >
          {wholeStay ? wholeStay.tenant.full_name : 'Vacant'}
        </span>
      ) : room.beds.length === 0 ? (
        <span className="rounded-md border border-dashed px-2 py-1.5 text-xs text-amber-700">
          No beds yet
        </span>
      ) : (
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          {room.beds.map((b, i) => (
            <span
              key={b.id}
              title={`Bed ${b.label}: ${BED_STATE[states[i]!].label}`}
              className={cn(
                'flex size-7 items-center justify-center rounded-md border text-[11px] font-semibold',
                BED_STATE[states[i]!].tile,
              )}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {whole ? (wholeStay ? 'Rented' : 'Free') : `${occupied}/${room.beds.length} occupied`}
          {blocked ? ` · ${blocked} in maintenance` : ''}
        </span>
        {showMoney && rent ? (
          <span className="font-medium tabular-nums">
            {formatMoney(rent)}
            <span className="font-normal text-muted-foreground">{whole ? '/room' : '/bed'}</span>
          </span>
        ) : null}
      </div>
    </button>
  )
}

export function FloorLayoutView({
  summaries,
  selected,
  onSelect,
  onOpenRoom,
  onAddOnFloor,
  stays,
  canManage,
  showMoney,
}: {
  summaries: FloorSummary[]
  selected: FloorSummary | undefined
  onSelect: (key: string) => void
  onOpenRoom: (roomId: string) => void
  onAddOnFloor: (f: FloorSummary) => void
  stays?: StayIndex
  canManage: boolean
  showMoney: boolean
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <Card className="h-fit lg:sticky lg:top-20">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Building2 className="size-4 text-muted-foreground" />
          <h3 className="text-[14px] font-semibold">Building</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {plural(summaries.filter((s) => s.key !== 'none').length, 'floor')}
          </span>
        </div>
        <nav aria-label="Floors" className="grid gap-2 p-3">
          {summaries.map((f) => (
            <FloorButton
              key={f.key}
              f={f}
              active={selected?.key === f.key}
              onClick={() => onSelect(f.key)}
            />
          ))}
        </nav>
      </Card>

      {selected && (
        <Card aria-labelledby="floor-heading" className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
            <div>
              <h3 id="floor-heading" className="text-[16px] font-semibold tracking-[-0.01em]">
                {selected.title}
              </h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {plural(selected.counts.rooms, 'room')} · {selected.counts.beds} beds ·{' '}
                {selected.counts.occupied + selected.counts.notice} occupied ·{' '}
                {selected.counts.vacant} vacant
                {selected.counts.blocked ? ` · ${selected.counts.blocked} under maintenance` : ''}
              </p>
            </div>
            {canManage && selected.key !== 'none' && (
              <Button variant="outline" size="sm" onClick={() => onAddOnFloor(selected)}>
                <Plus /> Add room on {selected.title}
              </Button>
            )}
          </div>
          <div className="p-5">
            {selected.rooms.length === 0 ? (
              <EmptyState
                icon={<Building2 />}
                title={`No rooms on ${selected.title} yet`}
                actions={
                  canManage && (
                    <Button onClick={() => onAddOnFloor(selected)}>
                      <Plus /> Add rooms
                    </Button>
                  )
                }
              >
                Add the rooms on this floor with their sharing and rent; the beds are made for you.
              </EmptyState>
            ) : (
              <>
                <StatusLegend className="mb-4" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {selected.rooms.map((r) => (
                    <RoomTile
                      key={r.id}
                      room={r}
                      stays={stays}
                      showMoney={showMoney}
                      onOpen={() => onOpenRoom(r.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
