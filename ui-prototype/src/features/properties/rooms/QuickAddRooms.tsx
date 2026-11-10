/** Add one room or many at once (101 to 110) with the same details. */
import { X } from 'lucide-react'
import { useState } from 'react'

import { Card } from '../../../components/ui-kit/card'
import { Button } from '../../../components/ui-kit/button'
import { Segmented } from '../../../components/ui-kit/choice-cards'
import { Alert } from '../../../components/ui-kit/feedback'
import { Field } from '../../../components/ui-kit/field'
import { Input, NativeSelect } from '../../../components/ui-kit/input'
import type { Property } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { cn } from '../../../lib/cn'
import { formatMoney, plural, rupeesToPaise } from '../../../lib/format'
import { addRooms } from '../actions'
import { MAX_QUICK_ROOMS, floorLabel, roomNumbers } from '../lib'
import { FeaturePicker } from './FeaturePicker'
import { stateToFeatures } from './features'
import type { FeatureState } from './features'

export interface QuickAddDefaults {
  floor: number
  from: string
}

export function SharingPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div role="radiogroup" aria-label="Beds in each room" className="flex gap-1">
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className={cn(
            'h-9 w-9 rounded-md border text-sm font-medium tabular-nums transition-colors',
            value === n
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-card hover:bg-secondary',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

export function QuickAddRooms({
  property,
  floors,
  taken,
  defaults,
  onClose,
}: {
  property: Property
  floors: number[]
  /** Room numbers already used in this property (lower case). */
  taken: Set<string>
  defaults: QuickAddDefaults
  onClose: () => void
}) {
  const { can } = useSession()
  const showMoney = can('rent.view')
  const [floor, setFloor] = useState(String(defaults.floor))
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState('')
  const [sharing, setSharing] = useState(2)
  const [letting, setLetting] = useState<'by_bed' | 'whole'>('by_bed')
  const [rent, setRent] = useState('')
  const [ac, setAc] = useState(false)
  const [bath, setBath] = useState(true)
  const [features, setFeatures] = useState<FeatureState>({
    bed: '',
    mattress: '',
    wardrobe: '',
    fan: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  const nums = roomNumbers(from, to)
  const bad = nums === 'bad'
  const numbers = bad ? [] : nums
  const tooMany = numbers.length > MAX_QUICK_ROOMS
  const beds = numbers.length * sharing
  const rentPaise = rupeesToPaise(rent)
  const rentError = !showMoney
    ? null
    : !rent.trim()
      ? 'Type the rent.'
      : rentPaise === null || rentPaise === 0
        ? 'Type an amount in rupees, e.g. 8500.'
        : null
  const takenNow = numbers.filter((n) => taken.has(n.toLowerCase()))
  const place = floorLabel(property, Number(floor)).toLowerCase()
  const canAdd = numbers.length > 0 && !tooMany && !rentError

  function add() {
    setTried(true)
    setError(null)
    if (!canAdd) return
    const feats = stateToFeatures(features)
    if (typeof feats === 'string') {
      setError(feats)
      return
    }
    const err = addRooms(
      property,
      numbers.map((number) => ({
        floor: Number(floor),
        number,
        sharing,
        letting,
        rent: rentPaise ?? 0,
        ac,
        attachedBath: bath,
        features: feats,
      })),
    )
    if (err) setError(err)
    else onClose()
  }

  return (
    <Card className="border-2 border-primary/50 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-5">
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
      <div className="grid gap-5 px-4 py-4 md:px-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Floor">
            <NativeSelect value={floor} onChange={(e) => setFloor(e.target.value)}>
              {floors.map((f) => (
                <option key={f} value={String(f)}>
                  {floorLabel(property, f)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Room numbers"
            hint="Fill both for many rooms, e.g. 101 to 110."
            error={
              tooMany
                ? `Up to ${MAX_QUICK_ROOMS} rooms at a time.`
                : bad
                  ? 'The last number must be after the first, e.g. 101 to 110.'
                  : tried && !numbers.length
                    ? 'Type a room number.'
                    : undefined
            }
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
            <SharingPicker value={sharing} onChange={setSharing} />
          </Field>
          {showMoney && (
            <Field
              label={
                letting === 'whole'
                  ? 'Rent for the whole room (₹ / month)'
                  : 'Rent per bed (₹ / month)'
              }
              error={tried ? (rentError ?? undefined) : undefined}
            >
              <Input
                inputMode="numeric"
                placeholder={letting === 'whole' ? '18000' : '8500'}
                value={rent}
                onChange={(e) => setRent(e.target.value)}
              />
            </Field>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="font-medium">Rented</span>
          <Segmented
            label="How the room is rented"
            value={letting}
            onChange={setLetting}
            options={[
              { value: 'by_bed', label: 'Bed by bed' },
              { value: 'whole', label: 'Whole room' },
            ]}
          />
        </div>

        <FeaturePicker
          ac={ac}
          setAc={setAc}
          bath={bath}
          setBath={setBath}
          features={features}
          setFeatures={setFeatures}
          showMoney={showMoney}
        />

        {takenNow.length > 0 && !error && (
          <Alert tone="warn">
            {takenNow.length === 1
              ? `Room ${takenNow[0]} is`
              : `Rooms ${takenNow.slice(0, 5).join(', ')}${takenNow.length > 5 ? '…' : ''} are`}{' '}
            already added. Choose other numbers.
          </Alert>
        )}
        {error && (
          <Alert tone="bad" title="Nothing was added">
            {error}
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/5 px-4 py-3">
          <p className="text-[13px]">
            {numbers.length === 0 || tooMany ? (
              'Type a room number to start.'
            ) : (
              <>
                <strong>{plural(numbers.length, 'room')}</strong>
                {numbers.length > 1 && ` (${numbers[0]} to ${numbers.at(-1)})`} with{' '}
                <strong>{plural(beds, 'bed')}</strong> will be added to {place}.
                {showMoney && rentPaise ? (
                  <span className="text-muted-foreground">
                    {' '}
                    Up to{' '}
                    {formatMoney(
                      letting === 'whole' ? rentPaise * numbers.length : rentPaise * beds,
                    )}{' '}
                    rent a month when full.
                  </span>
                ) : null}
              </>
            )}
          </p>
          <Button onClick={add} disabled={tooMany || bad || takenNow.length > 0}>
            {numbers.length > 1 ? `Add ${numbers.length} rooms` : 'Add room'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
