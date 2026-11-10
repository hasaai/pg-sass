import { BedDouble, DoorOpen, Home } from 'lucide-react'
import type { ReactNode } from 'react'

import { useList } from '../../api/hooks'
import type { Property } from '../../api/types'
import { Badge } from '../../components/ui-kit/badge'
import { Skeleton } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { NativeSelect } from '../../components/ui-kit/input'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'
import { useFreePlaces } from './api'
import type { FreePlace, PlaceKind } from './api'
import { PLACE_KIND_WORDS } from './labels'

const ICONS: Record<PlaceKind, ReactNode> = {
  bed: <BedDouble />,
  room: <DoorOpen />,
  unit: <Home />,
}
const ORDER: PlaceKind[] = ['bed', 'room', 'unit']

/**
 * Choose a property, then one free place in it: a bed, a whole room or a whole flat.
 * Only places a tenant can move into right now are listed (the server decides).
 */
export function PlacePicker({
  propertyId,
  onPropertyChange,
  value,
  onChange,
  error,
  excludeId,
}: {
  propertyId: string
  onPropertyChange: (id: string) => void
  value: FreePlace | null
  onChange: (place: FreePlace | null) => void
  error?: string
  /** Hide the place the tenant is in now (when moving). */
  excludeId?: string
}) {
  const properties = useList<Property>('/properties/', { status: 'active' })
  const free = useFreePlaces(propertyId || null)
  const places = (free.data ?? []).filter((p) => p.id !== excludeId)
  const groups = ORDER.map((kind) => ({
    kind,
    rows: places.filter((p) => p.kind === kind),
  })).filter((g) => g.rows.length > 0)

  return (
    <div className="grid gap-4">
      <Field label="Property" required>
        <NativeSelect
          value={propertyId}
          onChange={(e) => {
            onPropertyChange(e.target.value)
            onChange(null)
          }}
        >
          <option value="">Choose a property</option>
          {properties.rows.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {propertyId && (
        <fieldset className="grid gap-3">
          <legend className="mb-1.5 text-[13px] font-medium">
            Where will they stay?
            <span className="text-destructive" aria-hidden>
              {' '}
              *
            </span>
          </legend>
          {free.isLoading ? (
            <Skeleton className="h-24" />
          ) : groups.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">
              Nothing is free in this property right now.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.kind} className="grid gap-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {PLACE_KIND_WORDS[g.kind]}
                </p>
                <div
                  role="radiogroup"
                  aria-label={PLACE_KIND_WORDS[g.kind]}
                  className="grid gap-1.5"
                >
                  {g.rows.map((p) => {
                    const checked = value?.id === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => onChange(p)}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent [&_svg]:size-4',
                          checked && 'border-primary bg-accent ring-1 ring-primary',
                        )}
                      >
                        <span className="text-muted-foreground">{ICONS[p.kind]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.detail}
                          </span>
                        </span>
                        {p.reserved && <Badge tone="warn">Reserved</Badge>}
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {formatMoney(p.monthly_rent)}
                          <span className="text-xs font-normal text-muted-foreground"> /month</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </fieldset>
      )}
      {error && (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
