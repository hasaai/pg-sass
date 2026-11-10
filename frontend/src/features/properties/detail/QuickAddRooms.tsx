/**
 * Add one room or many at once (101 to 110) with the same details. It sends the rooms as a
 * small CSV to the rooms-import endpoint, so every rule is the same as "Upload CSV": checked
 * first, then all added or nothing.
 */
import { useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../api/client'
import { useApi } from '../../../api/hooks'
import type { components } from '../../../api/schema'
import type { Floor, Property, RentalUnit } from '../../../api/types'
import { Button } from '../../../components/ui-kit/button'
import { Card } from '../../../components/ui-kit/card'
import { Alert, ErrorAlert } from '../../../components/ui-kit/feedback'
import { Field } from '../../../components/ui-kit/field'
import { Input, NativeSelect } from '../../../components/ui-kit/input'
import { toast } from '../../../components/ui-kit/toast'
import { cn } from '../../../lib/cn'
import { plural } from '../../../lib/format'
import { PROPERTY_QUERIES } from '../api'
import { typeInfo } from '../propertyTypes'
import { MAX_QUICK_ROOMS, floorChoices, quickAddCsv, roomNumbers } from './rooms'

type Result = components['schemas']['RoomImportResult']
type Choice = components['schemas']['RoomFeatureChoice']

const SHARING = [1, 2, 3, 4, 5, 6]

export interface QuickAddDefaults {
  floor?: number
  unit?: string
  from?: string
}

export function QuickAddRooms({
  property,
  floors,
  units,
  defaults,
  onClose,
}: {
  property: Property
  floors: Floor[]
  units: RentalUnit[]
  defaults: QuickAddDefaults
  onClose: () => void
}) {
  const info = typeInfo(property.property_type)
  const queryClient = useQueryClient()
  const choices = useApi<Choice[]>('/rooms/feature-choices/')
  const [floor, setFloor] = useState(String(defaults.floor ?? floors[0]?.number ?? 0))
  const [flat, setFlat] = useState(defaults.unit ?? '')
  const [from, setFrom] = useState(defaults.from ?? '')
  const [to, setTo] = useState('')
  const [sharing, setSharing] = useState(info.roomDefaults.sharing || 2)
  const [whole, setWhole] = useState(!info.sharedLiving)
  const [rent, setRent] = useState('')
  const [ac, setAc] = useState(false)
  const [bath, setBath] = useState(false)
  const [features, setFeatures] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [problems, setProblems] = useState<Result['rows']>([])

  const unit = units.find((u) => u.id === flat)
  const unitWhole = unit?.letting === 'whole'
  const numbers = roomNumbers(from, to)
  const tooMany = numbers.length > MAX_QUICK_ROOMS
  const beds = whole || unitWhole ? 0 : numbers.length * sharing
  const place = unit
    ? unit.code
    : (floorChoices(floors).find((f) => f.value === floor)?.label ?? '')
  const needsRent = !unitWhole && !rent.trim()

  function toggle(key: string) {
    setFeatures((f) => {
      const next = { ...f }
      if (key in next) delete next[key]
      else next[key] = ''
      return next
    })
  }

  async function add() {
    if (!numbers.length || tooMany || needsRent) return
    setBusy(true)
    setError(null)
    setProblems([])
    const csv = quickAddCsv({
      numbers,
      floor: unit ? '' : floor,
      flat: unit?.code ?? '',
      sharing,
      whole: whole || unitWhole,
      rent: unitWhole ? '' : rent,
      ac,
      bath,
      features,
    })
    const send = (commit: boolean) => {
      const form = new FormData()
      form.append('file', new File([csv], 'rooms.csv', { type: 'text/csv' }))
      form.append('commit', String(commit))
      return api.upload<Result>(`/properties/${property.id}/rooms-import/`, form)
    }
    try {
      const check = await send(false)
      if (check.invalid) {
        setProblems(check.rows.filter((r) => r.problems.length))
        return
      }
      const done = await send(true)
      await queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === 'string' &&
          PROPERTY_QUERIES.some((p) => String(q.queryKey[0]).startsWith(p)),
      })
      toast.success(
        `${plural(done.created, 'room')}${done.beds ? ` and ${plural(done.beds, 'bed')}` : ''} added`,
      )
      onClose()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const chip = (on: boolean) =>
    cn(
      'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] transition-colors',
      on
        ? 'border-primary bg-primary/10 font-medium text-primary'
        : 'border-dashed border-input bg-card hover:bg-secondary',
    )

  return (
    <Card className="border-2 border-primary/60">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Add rooms</h2>
          <p className="text-[13px] text-muted-foreground">
            Add one room, or many at once with the same details.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close add rooms" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="grid gap-5 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {units.length > 0 && (
            <Field label={info.unitWord ?? 'Flat'}>
              <NativeSelect value={flat} onChange={(e) => setFlat(e.target.value)}>
                <option value="">Not inside a {(info.unitWord ?? 'flat').toLowerCase()}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {!unit && (
            <Field label="Floor">
              <NativeSelect value={floor} onChange={(e) => setFloor(e.target.value)}>
                {floorChoices(floors, property.total_floors).map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field
            label="Room numbers"
            hint="Fill both for many rooms, e.g. 101 to 110."
            error={tooMany ? `Up to ${MAX_QUICK_ROOMS} rooms at a time.` : undefined}
          >
            <div className="flex items-center gap-2">
              <Input
                aria-label="First room number"
                placeholder="101"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span className="text-[13px] text-muted-foreground">to</span>
              <Input
                aria-label="Last room number"
                placeholder="optional"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </Field>
          <Field label="Beds in each room (sharing)">
            <div role="radiogroup" aria-label="Beds in each room" className="flex gap-1">
              {SHARING.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={sharing === n}
                  className={cn(
                    'h-9 w-8 rounded-md border text-sm',
                    sharing === n
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-card hover:bg-secondary',
                  )}
                  onClick={() => setSharing(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
          {!unitWhole && (
            <Field
              label={whole ? 'Rent for the whole room (₹ / month)' : 'Rent per bed (₹ / month)'}
            >
              <Input
                inputMode="numeric"
                placeholder={whole ? '14000' : '8500'}
                value={rent}
                onChange={(e) => setRent(e.target.value)}
              />
            </Field>
          )}
        </div>

        {!unitWhole && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">Rented</span>
            <button type="button" className={chip(!whole)} onClick={() => setWhole(false)}>
              Bed by bed
            </button>
            <button type="button" className={chip(whole)} onClick={() => setWhole(true)}>
              Whole room
            </button>
          </div>
        )}

        <div className="grid gap-2">
          <p className="text-[13px] text-muted-foreground">Room has (tap to choose)</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={ac} className={chip(ac)} onClick={() => setAc(!ac)}>
              {ac && <Check className="size-3.5" />} AC
            </button>
            <button
              type="button"
              aria-pressed={bath}
              className={chip(bath)}
              onClick={() => setBath(!bath)}
            >
              {bath && <Check className="size-3.5" />} Attached bathroom
            </button>
            {(choices.data ?? []).map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={c.key in features}
                className={chip(c.key in features)}
                onClick={() => toggle(c.key)}
              >
                {c.key in features && <Check className="size-3.5" />} {c.name}
              </button>
            ))}
          </div>
          {Object.keys(features).length > 0 && (
            <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.keys(features).map((key) => {
                const name = choices.data?.find((c) => c.key === key)?.name ?? key
                return (
                  <label key={key} className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <Input
                      className="h-8 w-36"
                      inputMode="numeric"
                      aria-label={`${name} extra charge per month`}
                      placeholder="Included in rent"
                      value={features[key]}
                      onChange={(e) => setFeatures({ ...features, [key]: e.target.value })}
                    />
                  </label>
                )
              })}
              <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
                Leave empty when it is included in the rent, or type an extra charge per month.
              </p>
            </div>
          )}
        </div>

        <ErrorAlert error={error} />
        {problems.length > 0 && (
          <Alert tone="bad" title="Nothing was added. Please fix:">
            <ul className="grid gap-0.5">
              {problems.map((r) => (
                <li key={r.row}>
                  Room {r.room}: {r.problems.join(' ')}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/5 px-4 py-3">
          <p className="text-[13px]">
            {numbers.length === 0 ? (
              'Type a room number to start.'
            ) : (
              <>
                <strong>{plural(numbers.length, 'room')}</strong>
                {numbers.length > 1 && ` (${numbers[0]} to ${numbers[numbers.length - 1]})`}
                {beds > 0 && (
                  <>
                    {' '}
                    with <strong>{plural(beds, 'bed')}</strong>
                  </>
                )}{' '}
                will be added to {place}.
              </>
            )}
          </p>
          <Button
            disabled={!numbers.length || tooMany || needsRent}
            busy={busy}
            onClick={() => void add()}
          >
            {numbers.length > 1 ? `Add ${numbers.length} rooms` : 'Add room'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
