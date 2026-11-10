/** Pieces shared by the Rooms & beds views: bed chip + actions, legend, summary strip. */
import { Archive, Pencil, Wrench } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { api } from '../../../api/client'
import { useApiMutation } from '../../../api/hooks'
import type { Room } from '../../../api/types'
import { ConfirmDialog } from '../../../components/ui-kit/confirm'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../../../components/ui-kit/menu'
import { toast } from '../../../components/ui-kit/toast'
import { cn } from '../../../lib/cn'
import { formatMoney } from '../../../lib/format'
import { PROPERTY_QUERIES } from '../api'
import { BedDialog } from './dialogs'
import { BED_STATE, BED_STATE_ORDER } from './roomStats'
import { useBedStatus } from './useBedStatus'
import type { BedState, Counts } from './roomStats'

type Bed = Room['beds'][number]

/** The bed's menu items (edit, status, remove) plus the dialogs they open. */
export function BedMenuItems({
  bed,
  onEdit,
  onRemove,
}: {
  bed: Bed
  onEdit: () => void
  onRemove: () => void
}) {
  const setStatus = useBedStatus(bed)
  return (
    <>
      <MenuItem icon={<Pencil />} onSelect={onEdit}>
        Edit name or rent
      </MenuItem>
      {bed.status !== 'occupied' && (
        <>
          <MenuSeparator />
          {bed.status !== 'vacant' && (
            <MenuItem onSelect={() => setStatus('vacant')}>Mark available</MenuItem>
          )}
          {bed.status === 'vacant' && (
            <MenuItem onSelect={() => setStatus('reserved')}>Reserve</MenuItem>
          )}
          {bed.status !== 'blocked' && (
            <MenuItem icon={<Wrench />} onSelect={() => setStatus('blocked')}>
              Block for maintenance
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<Archive />} destructive onSelect={onRemove}>
            Remove bed
          </MenuItem>
        </>
      )}
    </>
  )
}

export function BedDialogs({
  bed,
  room,
  editing,
  setEditing,
  removing,
  setRemoving,
}: {
  bed: Bed
  room: Room
  editing: boolean
  setEditing: (v: boolean) => void
  removing: boolean
  setRemoving: (v: boolean) => void
}) {
  const archive = useApiMutation(() => api.post(`/beds/${bed.id}/archive/`), PROPERTY_QUERIES)
  return (
    <>
      {editing && <BedDialog open onOpenChange={setEditing} room={room} bed={bed} />}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove bed ${bed.label} from room ${room.number}?`}
        confirmLabel="Remove bed"
        destructive
        busy={archive.isPending}
        error={archive.error}
        onConfirm={() =>
          archive.mutate(undefined, {
            onSuccess: () => {
              setRemoving(false)
              toast.success(`Bed ${bed.label} removed`)
            },
          })
        }
      >
        <p>The bed is hidden from your lists and can’t take a tenant. Its history is kept.</p>
      </ConfirmDialog>
    </>
  )
}

/** A compact bed chip with its action menu (used in the room table). */
export function BedChip({
  bed,
  room,
  state,
  canManage,
}: {
  bed: Bed
  room: Room
  state: BedState
  canManage: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const s = BED_STATE[state]
  const style = cn('min-w-[4.25rem] rounded-md border px-2 py-1 text-left', s.tile)
  const body = (
    <>
      <span className="block text-xs font-semibold">Bed {bed.label}</span>
      <span className="block text-[11px] opacity-90">{s.label}</span>
    </>
  )
  if (!canManage) return <span className={style}>{body}</span>
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className={cn(style, 'transition-[filter] hover:brightness-95')}
            aria-label={`Bed ${bed.label} in room ${room.number}: ${s.label}`}
          >
            {body}
          </button>
        </MenuTrigger>
        <MenuContent>
          <BedMenuItems
            bed={bed}
            onEdit={() => setEditing(true)}
            onRemove={() => setRemoving(true)}
          />
        </MenuContent>
      </Menu>
      <BedDialogs
        bed={bed}
        room={room}
        editing={editing}
        setEditing={setEditing}
        removing={removing}
        setRemoving={setRemoving}
      />
    </>
  )
}

export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      {BED_STATE_ORDER.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={cn('size-2 rounded-[3px]', BED_STATE[k].dot)} aria-hidden />
          {BED_STATE[k].label}
        </li>
      ))}
    </ul>
  )
}

/** Stacked bar of bed states, to scale. */
export function StateBar({ counts, className }: { counts: Counts; className?: string }) {
  const parts: [BedState, number][] = [
    ['occupied', counts.occupied],
    ['notice', counts.notice],
    ['reserved', counts.reserved],
    ['vacant', counts.vacant],
    ['blocked', counts.blocked],
  ]
  return (
    <div
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}
      role="img"
      aria-label={`${counts.occupied + counts.notice} of ${counts.beds} beds occupied`}
    >
      {counts.beds > 0 &&
        parts.map(([k, n]) =>
          n ? (
            <span
              key={k}
              className={cn('h-full', BED_STATE[k].dot)}
              style={{ width: `${(n / counts.beds) * 100}%` }}
            />
          ) : null,
        )}
    </div>
  )
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: string
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-[22px] leading-none font-semibold tracking-[-0.02em] tabular-nums',
          tone,
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Building-wide numbers shown above every view. */
export function SummaryStrip({ counts, showMoney }: { counts: Counts; showMoney: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Rooms" value={counts.rooms} hint={`${counts.beds} beds`} />
      <Tile
        label="Occupied"
        value={counts.occupied + counts.notice}
        hint={
          counts.notice
            ? `${counts.notice} leaving soon`
            : `${counts.occupancyPct}% of rentable beds`
        }
        tone="text-sky-700"
      />
      <Tile
        label="Vacant"
        value={counts.vacant}
        hint={
          showMoney && counts.vacantRent
            ? `${formatMoney(counts.vacantRent)} a month unlet`
            : 'Ready for a tenant'
        }
        tone="text-emerald-700"
      />
      <Tile
        label="Reserved"
        value={counts.reserved}
        hint="Held for someone"
        tone="text-amber-700"
      />
      <Tile
        label="Under maintenance"
        value={counts.blocked}
        hint={counts.blocked ? 'Not counted as available' : 'All beds rentable'}
        tone={counts.blocked ? 'text-slate-700' : undefined}
      />
      <Tile
        label="Available"
        value={`${counts.availablePct}%`}
        hint={`${counts.vacant} of ${counts.sellable} rentable beds`}
      />
    </div>
  )
}
