import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../../components/ui-kit/button'
import { Segmented } from '../../../components/ui-kit/choice-cards'
import { Dialog } from '../../../components/ui-kit/dialog'
import { Alert } from '../../../components/ui-kit/feedback'
import { Field } from '../../../components/ui-kit/field'
import { Input, NativeSelect } from '../../../components/ui-kit/input'
import { toast } from '../../../components/ui-kit/toast'
import { floorName } from '../../../data/selectors'
import type { Bed, Property, Room } from '../../../data/types'
import { paiseToRupeesInput, plural, rupeesToPaise } from '../../../lib/format'
import { addFloor, removeFloor, renameFloor, saveRoom, setBedRent } from '../actions'
import { floorLabel, roomPrice } from '../lib'
import { FeaturePicker } from './FeaturePicker'
import { featuresToState, stateToFeatures } from './features'
import { SharingPicker } from './QuickAddRooms'

export function EditRoomDialog({
  room,
  property,
  floors,
  bedCount,
  onClose,
}: {
  room: Room
  property: Property
  floors: number[]
  bedCount: number
  onClose: () => void
}) {
  const [number, setNumber] = useState(room.number)
  const [floor, setFloor] = useState(String(room.floor))
  const [sharing, setSharing] = useState(room.sharing)
  const [letting, setLetting] = useState(room.letting)
  const [rent, setRent] = useState(paiseToRupeesInput(roomPrice(room)))
  const [ac, setAc] = useState(room.ac)
  const [bath, setBath] = useState(room.attachedBath)
  const [features, setFeatures] = useState(featuresToState(room.features))
  const [errors, setErrors] = useState<{ number?: string; rent?: string; form?: string }>({})

  function save() {
    const e: typeof errors = {}
    if (!number.trim()) e.number = 'Type the room number.'
    const rentP = rupeesToPaise(rent)
    if (rentP === null || rentP === 0) e.rent = 'Type an amount in rupees, e.g. 8500.'
    const feats = stateToFeatures(features)
    if (typeof feats === 'string') e.form = feats
    setErrors(e)
    if (Object.keys(e).length || typeof feats === 'string') return
    const err = saveRoom(room, {
      number: number.trim(),
      floor: Number(floor),
      sharing,
      letting,
      rent: rentP!,
      ac,
      attachedBath: bath,
      features: feats,
    })
    if (err) setErrors({ form: err })
    else onClose()
  }

  const bedChange = sharing - bedCount
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={`Edit room ${room.number}`}
      description={`${floorLabel(property, room.floor)} · ${property.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save room</Button>
        </>
      }
    >
      <div className="grid gap-5">
        {errors.form && <Alert tone="bad">{errors.form}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Room number" required error={errors.number}>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} />
          </Field>
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
            label="Beds in the room (sharing)"
            hint={
              bedChange > 0
                ? `${plural(bedChange, 'free bed')} will be added.`
                : bedChange < 0
                  ? `${plural(-bedChange, 'free bed')} will be removed.`
                  : `Now ${plural(bedCount, 'bed')}.`
            }
          >
            <SharingPicker value={sharing} onChange={setSharing} />
          </Field>
          <Field label="Rented">
            <Segmented
              label="How the room is rented"
              value={letting}
              onChange={setLetting}
              options={[
                { value: 'by_bed', label: 'Bed by bed' },
                { value: 'whole', label: 'Whole room' },
              ]}
            />
          </Field>
          <Field
            label={
              letting === 'whole'
                ? 'Rent for the whole room (₹ / month)'
                : 'Rent per bed (₹ / month)'
            }
            required
            error={errors.rent}
            hint="New rent applies to new tenants. Tenants staying now keep their rent."
            className="sm:col-span-2"
          >
            <Input inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} />
          </Field>
        </div>
        <FeaturePicker
          ac={ac}
          setAc={setAc}
          bath={bath}
          setBath={setBath}
          features={features}
          setFeatures={setFeatures}
          showMoney
        />
      </div>
    </Dialog>
  )
}

export function BedRentDialog({
  bed,
  room,
  onClose,
}: {
  bed: Bed
  room: Room
  onClose: () => void
}) {
  const [rent, setRent] = useState(paiseToRupeesInput(bed.rent))
  const [error, setError] = useState<string>()
  function save() {
    const p = rupeesToPaise(rent)
    if (p === null || p === 0) {
      setError('Type an amount in rupees, e.g. 8500.')
      return
    }
    setBedRent(bed, room, p)
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Rent of room ${room.number} · Bed ${bed.label}`}
      description="The monthly rent for a new tenant in this bed."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save rent</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Rent (₹ / month)" error={error}>
          <Input
            autoFocus
            inputMode="numeric"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  )
}

export function FloorsDialog({
  property,
  floors,
  usage,
  onClose,
}: {
  property: Property
  floors: number[]
  usage: Record<number, number>
  onClose: () => void
}) {
  const [names, setNames] = useState<Record<number, string>>({})
  const top = Math.max(...floors, 0)
  function saveNames() {
    let changed = 0
    for (const f of floors) {
      const n = names[f] ?? floorLabel(property, f)
      if (n.trim() !== floorLabel(property, f)) {
        renameFloor(property, f, n)
        changed++
      }
    }
    toast.success(changed ? 'Floor names saved' : 'Nothing changed')
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title="Floors"
      description="Rename a floor (e.g. Terrace) or add one. A floor with rooms can’t be removed."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={saveNames}>Save names</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <ul className="grid gap-2">
          {floors.map((f) => (
            <li key={f} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold tabular-nums">
                {f === 0 ? 'G' : f}
              </span>
              <div className="min-w-0 flex-1">
                <Input
                  aria-label={`Name of ${floorName(f)}`}
                  className="h-8"
                  value={names[f] ?? floorLabel(property, f)}
                  placeholder={floorName(f)}
                  onChange={(e) => setNames({ ...names, [f]: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {usage[f] ? plural(usage[f], 'room') : 'No rooms yet'}
                </p>
              </div>
              {!usage[f] && (f === top || f === 0) && (f !== 0 ? property.floors > 1 : true) && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={`Remove ${floorLabel(property, f)}`}
                  onClick={() => removeFloor(property, f)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => addFloor(property, 'top')}>
            <Plus /> Add {floorName(top + 1).toLowerCase()}
          </Button>
          {!floors.includes(0) && (
            <Button variant="outline" onClick={() => addFloor(property, 'ground')}>
              <Plus /> Add ground floor
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
