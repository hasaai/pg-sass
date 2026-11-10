/** Add / edit dialogs for floors, flats (portions), rooms and beds. */
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import { z } from 'zod'

import { ApiError, api } from '../../../api/client'
import { useApiMutation } from '../../../api/hooks'
import type { Floor, Property, RentalUnit, Room } from '../../../api/types'
import { Button } from '../../../components/ui-kit/button'
import { CheckboxRow } from '../../../components/ui-kit/checkbox'
import { Segmented } from '../../../components/ui-kit/choice-cards'
import { Dialog } from '../../../components/ui-kit/dialog'
import { ErrorAlert } from '../../../components/ui-kit/feedback'
import { Field } from '../../../components/ui-kit/field'
import { Input, NativeSelect } from '../../../components/ui-kit/input'
import { toast } from '../../../components/ui-kit/toast'
import { formatMoney, paiseToRupeesInput, rupeesToPaise } from '../../../lib/format'
import { PROPERTY_QUERIES } from '../api'
import { FURNISHING_OPTIONS, ROOM_TYPE_OPTIONS, UNIT_TYPE_OPTIONS, floorName } from '../labels'
import { floorChoices, nextBedLabel } from './rooms'
import { RoomFeaturesField } from './RoomFeatures'
import { featureRowsFrom, featuresBody, useFeatureChoices } from './featureRows'
import type { FeatureRow } from './featureRows'
import { typeInfo } from '../propertyTypes'

const rupees = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .refine((v) => (v === '' ? !required : rupeesToPaise(v) !== null), {
      message: required
        ? `Enter ${label} in rupees, e.g. 8500.`
        : `${label}: enter rupees, e.g. 8500.`,
    })

const optionalCount = (label: string, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= max), {
      message: `${label}: enter a whole number.`,
    })

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v))
const toPaise = (v: string) => (v.trim() === '' ? null : rupeesToPaise(v))

/** Copy server field errors onto the form; return true if any matched a field. */
function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  err: unknown,
  rename: Record<string, string> = {},
): void {
  if (!(err instanceof ApiError) || err.code !== 'validation_error') return
  for (const [field, value] of Object.entries(err.fields)) {
    const name = (rename[field] ?? field) as Path<T>
    if (name in form.getValues())
      form.setError(name, {
        type: 'server',
        message: Array.isArray(value) ? String(value[0]) : String(value),
      })
  }
}

function floorNumberOf(floorId: string | null | undefined, floors: Floor[]): string {
  const f = floors.find((x) => x.id === floorId)
  return f ? String(f.number) : ''
}

/* ------------------------------------------------------------------ room */

const roomSchema = z
  .object({
    number: z.string().trim().min(1, 'Enter the room number or name, e.g. 101.').max(20),
    floor: z.string(),
    unit: z.string(),
    room_type: z.enum(['private', 'shared', 'dormitory']),
    sharing: z
      .string()
      .trim()
      .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 12, {
        message: 'Beds in the room: 1 to 12.',
      }),
    letting: z.enum(['by_parts', 'whole']),
    monthly_rent: z.string(),
    bed_rent: z.string(),
    is_ac: z.boolean(),
    has_attached_bath: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const need = (field: 'monthly_rent' | 'bed_rent', message: string) => {
      if (rupeesToPaise(v[field]) === null) ctx.addIssue({ code: 'custom', path: [field], message })
    }
    if (v.letting === 'whole')
      need('monthly_rent', 'Enter the rent for the whole room, e.g. 15000.')
  })
type RoomValues = z.infer<typeof roomSchema>

export function RoomDialog({
  open,
  onOpenChange,
  property,
  floors,
  units,
  room,
  defaultUnit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  property: Property
  floors: Floor[]
  units: RentalUnit[]
  room?: Room | null
  defaultUnit?: string
}) {
  const info = typeInfo(property.property_type)
  const editing = Boolean(room)
  const form = useForm<RoomValues>({
    resolver: zodResolver(roomSchema),
    values: {
      number: room?.number ?? '',
      floor: room ? floorNumberOf(room.floor, floors) : '',
      unit: room?.unit ?? defaultUnit ?? '',
      room_type: room?.room_type ?? info.roomDefaults.roomType,
      sharing: String(room?.sharing ?? info.roomDefaults.sharing),
      letting:
        room?.letting ??
        (info.sharedLiving && info.roomDefaults.roomType !== 'private' ? 'by_parts' : 'whole'),
      monthly_rent: room?.monthly_rent ? paiseToRupeesInput(room.monthly_rent) : '',
      bed_rent: '',
      is_ac: room?.is_ac ?? false,
      has_attached_bath: room?.has_attached_bath ?? false,
    },
  })
  const { register, control, handleSubmit, formState } = form
  const unitId = useWatch({ control, name: 'unit' })
  const unit = units.find((u) => u.id === unitId)
  const inWholeUnit = unit?.letting === 'whole'
  const chosenLetting = useWatch({ control, name: 'letting' })
  const letting = inWholeUnit ? 'whole' : chosenLetting
  const sharing = Number(useWatch({ control, name: 'sharing' })) || 0
  const error = (k: keyof RoomValues) => formState.errors[k]?.message
  const liveBeds = room?.beds.length ?? 0
  const [features, setFeatures] = useState<FeatureRow[]>(() => featureRowsFrom(room?.features))
  const [featureError, setFeatureError] = useState<string>()
  const featureChoices = useFeatureChoices()
  const featureNames = Object.fromEntries((featureChoices.data ?? []).map((c) => [c.key, c.name]))

  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      room ? api.patch<Room>(`/rooms/${room.id}/`, body) : api.post<Room>('/rooms/', body),
    PROPERTY_QUERIES,
  )

  function onSubmit(v: RoomValues) {
    if (editing && Number(v.sharing) < liveBeds) {
      form.setError('sharing', {
        message: `This room has ${liveBeds} beds. Remove a bed first, or keep the sharing at ${liveBeds}.`,
      })
      return
    }
    const checked = featuresBody(features, featureNames)
    if (!checked.ok) {
      setFeatureError(checked.message)
      return
    }
    setFeatureError(undefined)
    const bedRent = rupeesToPaise(v.bed_rent)
    if (!editing && letting === 'by_parts' && !inWholeUnit && bedRent === null) {
      form.setError('bed_rent', { message: 'Enter the rent per bed, e.g. 8500.' })
      return
    }
    const body: Record<string, unknown> = {
      number: v.number.trim(),
      floor_number: toNumber(v.floor),
      unit: v.unit || null,
      room_type: v.room_type,
      sharing: Number(v.sharing),
      letting: inWholeUnit ? 'whole' : v.letting,
      monthly_rent: !inWholeUnit && v.letting === 'whole' ? toPaise(v.monthly_rent) : null,
      is_ac: v.is_ac,
      has_attached_bath: v.has_attached_bath,
      features: checked.body,
    }
    if (!editing) {
      body.property = property.id
      if (letting === 'by_parts' && !inWholeUnit) {
        body.bed_rent = bedRent
        body.bed_count = Number(v.sharing)
      }
    }
    save.mutate(body, {
      onSuccess: (saved) => {
        toast.success(editing ? `Room ${saved.number} saved` : `Room ${saved.number} added`)
        onOpenChange(false)
        form.reset()
        if (!editing) setFeatures([])
      },
      onError: (err) => applyServerErrors(form, err, { floor_number: 'floor' }),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      variant="side"
      title={editing ? `Edit room ${room?.number}` : 'Add a room'}
      description={
        editing
          ? 'Change the room’s details. Beds are added or removed in the room list.'
          : info.sharedLiving
            ? 'Rented bed by bed, the beds are created for you.'
            : 'A bedroom inside a flat or house, or a room you rent on its own.'
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="room-form" busy={save.isPending}>
            {editing
              ? 'Save room'
              : letting === 'by_parts' && !inWholeUnit
                ? `Add room and ${sharing || ''} beds`
                : 'Add room'}
          </Button>
        </>
      }
    >
      <form id="room-form" noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Room number or name" required error={error('number')}>
            <Input placeholder="e.g. 101" {...register('number')} />
          </Field>
          <Field label="Floor" error={error('floor')}>
            <NativeSelect {...register('floor')}>
              <option value="">Not set</option>
              {floorChoices(floors, property.total_floors).map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {info.unitWord && units.length > 0 && (
          <Field
            label={`In which ${info.unitWord.toLowerCase()}?`}
            hint={`Leave empty for a room that is not part of a ${info.unitWord.toLowerCase()}.`}
            error={error('unit')}
          >
            <NativeSelect {...register('unit')}>
              <option value="">Not in a {info.unitWord.toLowerCase()}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.letting_label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind of room" error={error('room_type')}>
            <NativeSelect {...register('room_type')}>
              {ROOM_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Sharing (people per room)"
            hint={
              editing && liveBeds
                ? `Has ${liveBeds} ${liveBeds === 1 ? 'bed' : 'beds'}; a room never has more beds than its sharing.`
                : 'A room never has more beds than its sharing.'
            }
            error={error('sharing')}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={Math.max(1, liveBeds)}
              max={12}
              {...register('sharing')}
            />
          </Field>
        </div>

        {inWholeUnit ? (
          <p className="rounded-lg border bg-secondary/50 px-3 py-2 text-[13px] text-muted-foreground">
            {unit?.code} is rented as a whole, so this room has no rent of its own.
          </p>
        ) : (
          <div className="grid gap-3">
            <span className="text-[13px] font-medium">How is it rented?</span>
            <Controller
              control={control}
              name="letting"
              render={({ field }) => (
                <Segmented
                  label="How is it rented?"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'by_parts', label: 'Bed by bed' },
                    { value: 'whole', label: 'Whole room' },
                  ]}
                />
              )}
            />
            {letting === 'whole' ? (
              <Field label="Rent for the room (₹ per month)" required error={error('monthly_rent')}>
                <Input inputMode="decimal" placeholder="e.g. 15000" {...register('monthly_rent')} />
              </Field>
            ) : editing ? (
              <p className="text-[13px] text-muted-foreground">
                Each bed has its own rent; change it in the room list.
              </p>
            ) : (
              <Field
                label="Rent per bed (₹ per month)"
                required
                hint={sharing ? `${sharing} beds will be created (A, B, C…).` : undefined}
                error={error('bed_rent')}
              >
                <Input inputMode="decimal" placeholder="e.g. 8500" {...register('bed_rent')} />
              </Field>
            )}
          </div>
        )}

        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <Controller
            control={control}
            name="is_ac"
            render={({ field }) => (
              <CheckboxRow
                label="Air-conditioned"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
              />
            )}
          />
          <Controller
            control={control}
            name="has_attached_bath"
            render={({ field }) => (
              <CheckboxRow
                label="Attached bathroom"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
              />
            )}
          />
        </div>
        <RoomFeaturesField value={features} onChange={setFeatures} error={featureError} />
        <ErrorAlert
          error={save.error}
          fields={Object.keys(form.getValues()).concat('floor_number', 'features')}
        />
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ flat / portion */

const unitSchema = z
  .object({
    code: z.string().trim().min(1, 'Enter a name, e.g. Flat 302.').max(30),
    floor: z.string(),
    unit_type: z.string(),
    bedrooms: optionalCount('Bedrooms', 20),
    bathrooms: optionalCount('Bathrooms', 20),
    area_sqft: optionalCount('Area', 1_000_000),
    furnishing: z.string(),
    letting: z.enum(['whole', 'by_parts']),
    monthly_rent: rupees('the rent', false),
    deposit: rupees('Deposit', false),
    max_occupants: optionalCount('People', 50),
  })
  .superRefine((v, ctx) => {
    if (v.letting === 'whole' && rupeesToPaise(v.monthly_rent) === null)
      ctx.addIssue({
        code: 'custom',
        path: ['monthly_rent'],
        message: 'Enter the monthly rent, e.g. 25000.',
      })
  })
type UnitValues = z.infer<typeof unitSchema>

export function UnitDialog({
  open,
  onOpenChange,
  property,
  floors,
  unit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  property: Property
  floors: Floor[]
  unit?: RentalUnit | null
}) {
  const info = typeInfo(property.property_type)
  const word = info.unitWord ?? 'Flat'
  const editing = Boolean(unit)
  const form = useForm<UnitValues>({
    resolver: zodResolver(unitSchema),
    values: {
      code: unit?.code ?? '',
      floor: unit ? floorNumberOf(unit.floor, floors) : '',
      unit_type: unit?.unit_type ?? (word === 'Portion' ? 'portion' : '2bhk'),
      bedrooms: unit?.bedrooms != null ? String(unit.bedrooms) : '',
      bathrooms: unit?.bathrooms != null ? String(unit.bathrooms) : '',
      area_sqft: unit?.area_sqft != null ? String(unit.area_sqft) : '',
      furnishing: unit?.furnishing ?? '',
      letting: unit?.letting ?? 'whole',
      monthly_rent: unit?.monthly_rent ? paiseToRupeesInput(unit.monthly_rent) : '',
      deposit: unit?.deposit ? paiseToRupeesInput(unit.deposit) : '',
      max_occupants: unit?.max_occupants != null ? String(unit.max_occupants) : '',
    },
  })
  const { register, control, handleSubmit, formState } = form
  const letting = useWatch({ control, name: 'letting' })
  const error = (k: keyof UnitValues) => formState.errors[k]?.message
  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      unit
        ? api.patch<RentalUnit>(`/units/${unit.id}/`, body)
        : api.post<RentalUnit>('/units/', body),
    PROPERTY_QUERIES,
  )

  function onSubmit(v: UnitValues) {
    const body: Record<string, unknown> = {
      code: v.code.trim(),
      floor_number: toNumber(v.floor),
      unit_type: v.unit_type,
      bedrooms: toNumber(v.bedrooms),
      bathrooms: toNumber(v.bathrooms),
      area_sqft: toNumber(v.area_sqft),
      furnishing: v.furnishing,
      letting: v.letting,
      monthly_rent: v.letting === 'whole' ? toPaise(v.monthly_rent) : null,
      deposit: v.letting === 'whole' ? toPaise(v.deposit) : null,
      max_occupants: toNumber(v.max_occupants),
    }
    if (!editing) body.property = property.id
    save.mutate(body, {
      onSuccess: (saved) => {
        toast.success(`${saved.code} ${editing ? 'saved' : 'added'}`)
        onOpenChange(false)
        form.reset()
      },
      onError: (err) => applyServerErrors(form, err, { floor_number: 'floor' }),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      variant="side"
      title={editing ? `Edit ${unit?.code}` : `Add a ${word.toLowerCase()}`}
      description={
        word === 'Portion'
          ? 'A part of the house rented on its own, e.g. “Ground floor portion”.'
          : 'A flat rented to one family or group, or room by room.'
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="unit-form" busy={save.isPending}>
            {editing ? 'Save' : `Add ${word.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <form id="unit-form" noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${word} name or number`} required error={error('code')}>
            <Input
              placeholder={word === 'Portion' ? 'e.g. Ground floor' : 'e.g. Flat 302'}
              {...register('code')}
            />
          </Field>
          <Field label="Floor" error={error('floor')}>
            <NativeSelect {...register('floor')}>
              <option value="">Not set</option>
              {floorChoices(floors, property.total_floors).map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Size" error={error('unit_type')}>
            <NativeSelect {...register('unit_type')}>
              {UNIT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Furnishing" error={error('furnishing')}>
            <NativeSelect {...register('furnishing')}>
              {FURNISHING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Bedrooms" error={error('bedrooms')}>
            <Input type="number" inputMode="numeric" min={0} {...register('bedrooms')} />
          </Field>
          <Field label="Bathrooms" error={error('bathrooms')}>
            <Input type="number" inputMode="numeric" min={0} {...register('bathrooms')} />
          </Field>
          <Field label="Area (sq ft)" error={error('area_sqft')}>
            <Input type="number" inputMode="numeric" min={0} {...register('area_sqft')} />
          </Field>
        </div>
        <div className="grid gap-3">
          <span className="text-[13px] font-medium">How is it rented?</span>
          <Controller
            control={control}
            name="letting"
            render={({ field }) => (
              <Segmented
                label="How is it rented?"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'whole', label: word === 'Portion' ? 'Whole portion' : 'Whole flat' },
                  { value: 'by_parts', label: 'Room by room' },
                ]}
              />
            )}
          />
          {letting === 'whole' ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Rent (₹ per month)" required error={error('monthly_rent')}>
                <Input inputMode="decimal" placeholder="e.g. 25000" {...register('monthly_rent')} />
              </Field>
              <Field label="Security deposit (₹)" error={error('deposit')}>
                <Input inputMode="decimal" {...register('deposit')} />
              </Field>
              <Field label="Up to people" error={error('max_occupants')}>
                <Input type="number" inputMode="numeric" min={1} {...register('max_occupants')} />
              </Field>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Add its rooms in the Rooms tab; each room has its own rent.
            </p>
          )}
        </div>
        <ErrorAlert
          error={save.error}
          fields={Object.keys(form.getValues()).concat('floor_number')}
        />
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ bed */

const bedSchema = z.object({
  label: z.string().trim().min(1, 'Enter a bed name, e.g. A.').max(10),
  monthly_rent: rupees('the rent', true),
})
type BedValues = z.infer<typeof bedSchema>

export function BedDialog({
  open,
  onOpenChange,
  room,
  bed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: Room
  bed?: { id: string; label: string; monthly_rent: number } | null
}) {
  const editing = Boolean(bed)
  const suggestedRent = room.beds[0]?.monthly_rent
  const form = useForm<BedValues>({
    resolver: zodResolver(bedSchema),
    values: {
      label: bed?.label ?? nextBedLabel(room.beds.map((b) => b.label)),
      monthly_rent: bed
        ? paiseToRupeesInput(bed.monthly_rent)
        : suggestedRent
          ? paiseToRupeesInput(suggestedRent)
          : '',
    },
  })
  const { register, handleSubmit, formState } = form
  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      bed ? api.patch(`/beds/${bed.id}/`, body) : api.post('/beds/', { ...body, room: room.id }),
    PROPERTY_QUERIES,
  )
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit bed ${bed?.label}` : `Add a bed to room ${room.number}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="bed-form" busy={save.isPending}>
            {editing ? 'Save bed' : 'Add bed'}
          </Button>
        </>
      }
    >
      <form
        id="bed-form"
        noValidate
        className="grid gap-4"
        onSubmit={handleSubmit((v) =>
          save.mutate(
            { label: v.label.trim(), monthly_rent: rupeesToPaise(v.monthly_rent) },
            {
              onSuccess: () => {
                toast.success(editing ? 'Bed saved' : `Bed ${v.label} added`)
                onOpenChange(false)
              },
              onError: (err) => applyServerErrors(form, err),
            },
          ),
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bed name" required error={formState.errors.label?.message}>
            <Input {...register('label')} />
          </Field>
          <Field
            label="Rent (₹ per month)"
            required
            hint={
              !editing && suggestedRent ? `Other beds: ${formatMoney(suggestedRent)}` : undefined
            }
            error={formState.errors.monthly_rent?.message}
          >
            <Input inputMode="decimal" {...register('monthly_rent')} />
          </Field>
        </div>
        <ErrorAlert error={save.error} fields={['label', 'monthly_rent']} />
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ floors */

export function FloorsDialog({
  open,
  onOpenChange,
  property,
  floors,
  usage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  property: Property
  floors: Floor[]
  /** Rooms and flats per floor id, to explain why a floor cannot be removed. */
  usage: Record<string, number>
}) {
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const add = useApiMutation(
    (body: Record<string, unknown>) => api.post<Floor>('/floors/', body),
    PROPERTY_QUERIES,
  )
  const rename = useApiMutation(
    ({ id, name: n }: { id: string; name: string }) => api.patch(`/floors/${id}/`, { name: n }),
    PROPERTY_QUERIES,
  )
  const remove = useApiMutation(
    (id: string) => api.post(`/floors/${id}/archive/`),
    PROPERTY_QUERIES,
  )
  const used = new Set(floors.map((f) => f.number))
  const nextFree = floorChoices(floors, property.total_floors).find(
    (c) => !used.has(Number(c.value)),
  )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Floors"
      description="Floors are added for you when you pick one for a room or flat. Give a floor a name, e.g. “Terrace”, if its number is not enough."
      footer={<Button onClick={() => onOpenChange(false)}>Done</Button>}
    >
      <div className="grid gap-4">
        <ul className="divide-y rounded-lg border">
          {floors.length === 0 && (
            <li className="px-3 py-3 text-[13px] text-muted-foreground">No floors yet.</li>
          )}
          {floors.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-28 shrink-0 text-[13px] font-medium">{floorName(f.number)}</span>
              <Input
                aria-label={`Name for ${floorName(f.number)}`}
                defaultValue={f.name}
                placeholder="Optional name"
                className="h-8"
                onBlur={(e) => {
                  if (e.target.value.trim() !== f.name)
                    rename.mutate({ id: f.id, name: e.target.value.trim() })
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${f.display_name}`}
                disabled={(usage[f.id] ?? 0) > 0}
                title={
                  (usage[f.id] ?? 0) > 0 ? 'Move or remove its rooms and flats first' : undefined
                }
                onClick={() => remove.mutate(f.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            const n = number || nextFree?.value
            if (n === undefined) return
            add.mutate(
              { property: property.id, number: Number(n), name: name.trim() },
              {
                onSuccess: () => {
                  setNumber('')
                  setName('')
                },
              },
            )
          }}
        >
          <Field label="Floor">
            <NativeSelect
              value={number || nextFree?.value || ''}
              onChange={(e) => setNumber(e.target.value)}
            >
              {[-2, -1, ...Array.from({ length: 61 }, (_, i) => i)]
                .filter((n) => !used.has(n))
                .map((n) => (
                  <option key={n} value={n}>
                    {floorName(n)}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Name (optional)">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Terrace"
            />
          </Field>
          <Button type="submit" variant="outline" busy={add.isPending}>
            <Plus /> Add floor
          </Button>
        </form>
        <ErrorAlert error={add.error ?? rename.error ?? remove.error} />
      </div>
    </Dialog>
  )
}
