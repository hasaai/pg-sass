import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  BedDouble,
  Building,
  Building2,
  Check,
  Hotel,
  House,
  LocateFixed,
  MapPin,
  Sparkles,
  Images,
  Users,
  ExternalLink,
} from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { ApiError, api } from '../../api/client'
import { useApi, useList } from '../../api/hooks'
import type { AmenityCatalog, Property, PropertyAmenity, Room } from '../../api/types'
import { AmenitiesSection } from '../../components/AmenitiesSection'
import type { PickSource } from '../../components/LocationPicker'
import { PhotoManager } from '../../components/PhotoManager'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { ChoiceCards } from '../../components/ui-kit/choice-cards'
import { Alert, ErrorAlert, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { LogoUploader } from '../../components/ui-kit/logo-uploader'
import { toast } from '../../components/ui-kit/toast'
import {
  amenityIndex,
  errorsFromApi,
  fromSaved,
  incompatible,
  samePayload,
  toPayload,
} from '../../lib/amenities'
import type { DraftErrors, Drafts } from '../../lib/amenities'
import { cn } from '../../lib/cn'
import { googleMapsLink, makePoint, parseLocationInput } from '../../lib/location'
import type { PickedAddress } from '../../lib/location'
import { PROPERTY_QUERIES } from './api'
import { GENDER_OPTIONS, MAX_PROPERTY_PHOTOS } from './labels'
import {
  ALL_FIELDS,
  API_FIELD,
  STEP_FIELDS,
  initialValues,
  propertySchema,
  toBody,
} from './propertyForm'
import type { PropertyFormValues } from './propertyForm'
import { PROPERTY_TYPES, typeInfo } from './propertyTypes'
import type { PropertyType } from './propertyTypes'

const LocationPicker = lazy(() => import('../../components/LocationPicker'))

const TYPE_ICONS: Record<PropertyType, ReactNode> = {
  pg: <BedDouble />,
  coliving: <Users />,
  hostel: <Hotel />,
  apartment: <Building />,
  building: <Building2 />,
  house: <House />,
}

const STEPS = [
  { key: 'type', title: 'Type of place', description: 'What you rent out decides the questions.' },
  { key: 'details', title: 'Name & location', description: 'Name, address and map pin.' },
  { key: 'building', title: 'Building details', description: 'Size, floors and rent day.' },
  { key: 'amenities', title: 'Amenities', description: 'What tenants get.' },
  { key: 'photos', title: 'Logo & photos', description: 'Logo, building, rooms, common areas.' },
] as const
type StepKey = (typeof STEPS)[number]['key']

function Stepper({
  current,
  reachable,
  onGo,
}: {
  current: number
  reachable: (i: number) => boolean
  onGo: (i: number) => void
}) {
  return (
    <ol className="grid gap-1" aria-label="Steps">
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        const can = reachable(i)
        return (
          <li key={s.key}>
            <button
              type="button"
              disabled={!can}
              onClick={() => onGo(i)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-default',
                active ? 'bg-card shadow-xs ring-1 ring-border' : can && 'hover:bg-secondary',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  active && 'border-primary bg-primary text-primary-foreground',
                  done && !active && 'border-primary bg-accent text-primary',
                  !done && !active && 'bg-card text-muted-foreground',
                )}
              >
                {done && !active ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-[13px] font-medium',
                    !active && !done && 'text-muted-foreground',
                  )}
                >
                  {s.title}
                </span>
                <span className="block text-xs text-muted-foreground">{s.description}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Loads the property (when editing) and what the amenities step needs, then shows the form. */
export function PropertyWizardPage() {
  const { id } = useParams()
  const existing = useApi<Property>(id ? `/properties/${id}/` : null)
  if (id && existing.isLoading)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  if (id && (existing.error || !existing.data))
    return <ErrorAlert error={existing.error ?? 'Not found'} />
  return <Wizard key={id ?? 'new'} existing={existing.data ?? null} />
}

function Wizard({ existing }: { existing: Property | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [property, setProperty] = useState<Property | null>(existing)
  const stepFromUrl = STEPS.findIndex((s) => s.key === params.get('step'))
  const [step, setStep] = useState(existing && stepFromUrl > 0 ? stepFromUrl : 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [suggested, setSuggested] = useState<PickedAddress | null>(null)

  const catalog = useApi<AmenityCatalog>('/amenities/', undefined, { staleTime: 5 * 60_000 })
  const savedAmenities = useApi<PropertyAmenity[]>(
    property ? `/properties/${property.id}/amenities/` : null,
  )
  const rooms = useList<Room>(property ? '/rooms/' : null, { property: property?.id })
  // Photos change through their own endpoints, so read them fresh rather than from `property`.
  const live = useApi<Property>(property ? `/properties/${property.id}/` : null)
  const [amenities, setAmenities] = useState<Drafts | null>(null)
  const [amenityErrors, setAmenityErrors] = useState<DraftErrors>({})
  const drafts = amenities ?? fromSaved(savedAmenities.data ?? [])
  const index = amenityIndex(catalog.data)

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: initialValues(existing),
    mode: 'onTouched',
  })
  const { register, control, formState, setValue, trigger, getValues } = form
  const type = useWatch({ control, name: 'property_type' })
  const locationInput = useWatch({ control, name: 'location' })
  const info = typeInfo(type)
  const editing = existing !== null
  const fieldError = (name: keyof PropertyFormValues) => formState.errors[name]?.message

  useBreadcrumbs([
    { label: 'Properties', to: '/app/properties' },
    ...(property ? [{ label: property.name, to: `/app/properties/${property.id}` }] : []),
    { label: editing ? 'Edit' : 'Add property' },
  ])

  function go(i: number) {
    setError(null)
    setStep(i)
    if (editing) setParams({ step: STEPS[i]!.key }, { replace: true })
    window.scrollTo({ top: 0 })
  }

  async function refresh() {
    await queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === 'string' &&
        PROPERTY_QUERIES.some((p) => (q.queryKey[0] as string).startsWith(p)),
    })
  }

  /** Show server field errors next to the fields; anything else above the buttons. */
  function showServerError(err: unknown) {
    if (err instanceof ApiError && err.code === 'validation_error') {
      for (const [apiField, value] of Object.entries(err.fields)) {
        const field = (API_FIELD[apiField] ?? apiField) as keyof PropertyFormValues
        if (field in getValues()) {
          const message = Array.isArray(value) ? String(value[0]) : String(value)
          form.setError(field, { type: 'server', message })
        }
      }
    }
    setError(err)
  }

  async function savePropertyFields(fields: readonly (keyof PropertyFormValues)[]) {
    const values = getValues()
    if (!property) {
      const created = await api.post<Property>('/properties/', toBody(values, ALL_FIELDS))
      setProperty(created)
      return created
    }
    const saved = await api.patch<Property>(`/properties/${property.id}/`, toBody(values, fields))
    setProperty(saved)
    return saved
  }

  async function saveAmenities(target: Property): Promise<boolean> {
    const { assignments, errors, order } = toPayload(drafts, index)
    setAmenityErrors(errors)
    if (Object.keys(errors).length) {
      setError(new Error('Some amenity details need fixing (marked below).'))
      return false
    }
    const before = toPayload(fromSaved(savedAmenities.data ?? []), index).assignments
    if (samePayload(assignments, before)) return true
    try {
      await api.put(`/properties/${target.id}/amenities/`, { assignments })
      setAmenities(null)
      return true
    } catch (err) {
      if (err instanceof ApiError) setAmenityErrors(errorsFromApi(err.fields, order))
      setError(
        err instanceof ApiError && err.code === 'validation_error'
          ? new Error('Some amenity details need fixing (marked below).')
          : err,
      )
      return false
    }
  }

  async function next() {
    const key: StepKey = STEPS[step]!.key
    setError(null)
    if (key === 'type' || key === 'details' || key === 'building') {
      const fields = STEP_FIELDS[key]
      if (!(await trigger([...fields]))) return
      // A new property is created when "Name & location" is done.
      if (!property && key === 'type') return go(step + 1)
      setSaving(true)
      try {
        await savePropertyFields(fields)
        await refresh()
        if (key === 'type' && editing && type !== existing?.property_type) {
          setAmenities(null) // the server dropped amenities that no longer apply
          await savedAmenities.refetch()
        }
      } catch (err) {
        showServerError(err)
        setSaving(false)
        return
      }
      setSaving(false)
      if (!property && key === 'details') {
        toast.success('Property saved as “Not finished”. Keep going or finish later.')
        setStep(step + 1)
        return
      }
      return go(step + 1)
    }
    if (key === 'amenities' && property) {
      setSaving(true)
      const ok = await saveAmenities(property)
      setSaving(false)
      if (!ok) return
      await refresh()
      return go(step + 1)
    }
    if (key === 'photos' && property) {
      toast.success(editing ? 'Changes saved' : 'Property added. Now add its rooms.')
      navigate(`/app/properties/${property.id}`)
    }
  }

  function fillAddress(a: PickedAddress) {
    for (const [k, v] of Object.entries(a) as [keyof PickedAddress, string][])
      setValue(k, v, { shouldDirty: true })
    setSuggested(null)
  }

  function onPick(
    p: { latitude: string; longitude: string },
    address: PickedAddress | null,
    source: PickSource,
  ) {
    setValue('location', `${p.latitude}, ${p.longitude}`, {
      shouldDirty: true,
      shouldValidate: true,
    })
    if (!address || Object.keys(address).length === 0) return setSuggested(null)
    if (source === 'search') fillAddress(address)
    else setSuggested(address)
  }

  function useMyLocation() {
    if (!navigator.geolocation)
      return setError(new Error('This browser cannot share its location.'))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = makePoint(pos.coords.latitude, pos.coords.longitude)
        if (p) setValue('location', `${p.latitude}, ${p.longitude}`, { shouldValidate: true })
      },
      () => setError(new Error('Location permission was refused.')),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const point = parseLocationInput(locationInput ?? '')
  const current = STEPS[step]!
  const last = step === STEPS.length - 1
  const reachable = (i: number) => i <= step || property !== null
  const changedTypeDrops =
    editing && type !== existing?.property_type ? incompatible(drafts, index, type) : []

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            to={property ? `/app/properties/${property.id}` : '/app/properties'}
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground no-underline hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> {property ? property.name : 'Properties'}
          </Link>
        }
        title={
          editing
            ? `Edit ${existing.name}`
            : property
              ? `Set up ${property.name}`
              : 'Add a property'
        }
        description={
          editing
            ? 'Change any step; each step saves on its own.'
            : 'Five short steps. After “Name & location” your property is saved, so you can finish later.'
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">
            <Stepper current={step} reachable={reachable} onGo={go} />
          </div>
          <p className="text-[13px] text-muted-foreground lg:hidden">
            Step {step + 1} of {STEPS.length} ·{' '}
            <strong className="text-foreground">{current.title}</strong>
          </p>
        </aside>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void next()
          }}
        >
          <Card>
            <div className="border-b px-6 py-4">
              <h2 className="text-base font-semibold">{current.title}</h2>
              <p className="text-[13px] text-muted-foreground">{current.description}</p>
            </div>
            <div className="grid gap-5 px-6 py-5">
              {current.key === 'type' && (
                <>
                  <Controller
                    control={control}
                    name="property_type"
                    render={({ field }) => (
                      <ChoiceCards
                        label="Type of place"
                        value={field.value}
                        onChange={field.onChange}
                        choices={PROPERTY_TYPES.map((t) => ({
                          value: t.value,
                          label: t.label,
                          description: t.description,
                          icon: TYPE_ICONS[t.value],
                        }))}
                      />
                    )}
                  />
                  <Alert tone="info" title={`How it works for: ${info.label}`}>
                    {info.structure === 'rooms' &&
                      'You add floors and rooms; each room is rented bed by bed or as a whole room.'}
                    {info.structure === 'rooms_or_flats' &&
                      'You add rooms directly, or group them in flats. Private rooms are rented whole, shared rooms bed by bed.'}
                    {info.structure === 'flats' &&
                      'You add flats (1 BHK, 2 BHK…). Each flat is rented as a whole, or room by room.'}
                    {info.structure === 'portions' &&
                      'The house starts as one “Whole house”. You can split it into portions (ground floor, first floor) instead.'}
                  </Alert>
                  {changedTypeDrops.length > 0 && (
                    <Alert tone="warn" title="Some amenities will be removed">
                      They don’t apply to this type:{' '}
                      {changedTypeDrops.map((k) => index.get(k)?.name ?? k).join(', ')}.
                    </Alert>
                  )}
                </>
              )}

              {current.key === 'details' && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Property name" required error={fieldError('name')}>
                      <Input
                        placeholder={info.sharedLiving ? 'e.g. Sunrise PG' : 'e.g. Maple Residency'}
                        {...register('name')}
                      />
                    </Field>
                    {info.sharedLiving && (
                      <Field label="Who can stay" error={fieldError('gender')}>
                        <NativeSelect {...register('gender')}>
                          {GENDER_OPTIONS.map((g) => (
                            <option key={g.value} value={g.value}>
                              {g.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                    )}
                  </div>
                  <div className="grid gap-3 rounded-lg border bg-secondary/40 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="size-4 text-muted-foreground" /> Map location
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      Search the place or a landmark to fill in the address, then drag the pin to
                      the entrance. The public map shows it only approximately.
                    </p>
                    <Suspense fallback={<Skeleton className="h-64" />}>
                      <LocationPicker value={point} onPick={onPick} />
                    </Suspense>
                    {suggested && (
                      <Alert
                        tone="info"
                        actions={
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fillAddress(suggested)}
                          >
                            Use this address
                          </Button>
                        }
                      >
                        Address at the pin:{' '}
                        <strong>
                          {[
                            suggested.address_line,
                            suggested.locality,
                            suggested.city,
                            suggested.pincode,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </strong>
                      </Alert>
                    )}
                    <div className="grid gap-3">
                      <Field
                        label="Location"
                        hint="Paste a Google Maps link or numbers like 12.9116, 77.6474"
                        error={fieldError('location')}
                      >
                        <Input {...register('location')} />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={useMyLocation}>
                          <LocateFixed /> Use my location
                        </Button>
                        {point && (
                          <Button variant="ghost" asChild>
                            <a href={googleMapsLink(point)} target="_blank" rel="noreferrer">
                              <ExternalLink /> Check in Google Maps
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <Field label="Address" required error={fieldError('address_line')}>
                    <Input
                      placeholder="House / building number, street"
                      {...register('address_line')}
                    />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Locality" required error={fieldError('locality')}>
                      <Input placeholder="e.g. HSR Layout" {...register('locality')} />
                    </Field>
                    <Field label="Landmark" hint="Shown publicly" error={fieldError('landmark')}>
                      <Input placeholder="e.g. Near BDA Complex" {...register('landmark')} />
                    </Field>
                    <Field
                      label="Contact number for this property"
                      hint="Optional. Leave empty to use your own number."
                      error={fieldError('contact_phone')}
                    >
                      <Input inputMode="tel" maxLength={15} {...register('contact_phone')} />
                    </Field>
                    <Field label="Pincode" error={fieldError('pincode')}>
                      <Input inputMode="numeric" maxLength={6} {...register('pincode')} />
                    </Field>
                    <Field label="City" required error={fieldError('city')}>
                      <Input {...register('city')} />
                    </Field>
                    <Field label="State" error={fieldError('state')}>
                      <Input {...register('state')} />
                    </Field>
                  </div>
                </>
              )}

              {current.key === 'building' && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {info.asks.buildingName && (
                      <Field
                        label={type === 'apartment' ? 'Apartment / society name' : 'Building name'}
                        error={fieldError('building_name')}
                      >
                        <Input
                          placeholder="e.g. Prestige Lakeside"
                          {...register('building_name')}
                        />
                      </Field>
                    )}
                    {info.asks.totalFloors && (
                      <Field
                        label={type === 'house' ? 'Floors in the house' : 'Floors in the building'}
                        hint="Including the ground floor"
                        error={fieldError('total_floors')}
                      >
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={200}
                          {...register('total_floors')}
                        />
                      </Field>
                    )}
                    {info.asks.area && (
                      <Field label="Built-up area (sq ft)" error={fieldError('built_up_area_sqft')}>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          {...register('built_up_area_sqft')}
                        />
                      </Field>
                    )}
                    {info.asks.yearBuilt && (
                      <Field label="Year built" error={fieldError('year_built')}>
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder="e.g. 2016"
                          {...register('year_built')}
                        />
                      </Field>
                    )}
                    <Field
                      label="Rent due on day"
                      required
                      hint="Day of the month rent is due (1–28)"
                      error={fieldError('rent_due_day')}
                    >
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={28}
                        {...register('rent_due_day')}
                      />
                    </Field>
                  </div>
                  <Field
                    label="About the place"
                    hint="A few lines for your team and, later, your listing."
                    error={fieldError('description')}
                  >
                    <Textarea rows={4} {...register('description')} />
                  </Field>
                </>
              )}

              {current.key === 'amenities' && (
                <div className="legacy">
                  {catalog.isLoading || savedAmenities.isLoading ? (
                    <Skeleton className="h-80" />
                  ) : (
                    <AmenitiesSection
                      catalog={catalog.data}
                      loading={catalog.isLoading}
                      error={catalog.error}
                      onRetry={() => void catalog.refetch()}
                      propertyType={type}
                      value={drafts}
                      onChange={setAmenities}
                      errors={amenityErrors}
                      rooms={rooms.rows}
                    />
                  )}
                </div>
              )}

              {current.key === 'photos' && property && (
                <div className="grid gap-2 rounded-lg border p-4">
                  <span className="text-sm font-medium">Logo of this property (optional)</span>
                  <LogoUploader
                    path={`/properties/${property.id}/logo/`}
                    logoUrl={live.data?.logo_url ?? property.logo_url}
                    name={property.name}
                    canEdit
                    onChanged={() => void live.refetch()}
                  />
                </div>
              )}
              {current.key === 'photos' && property && (
                <div className="legacy">
                  <p className="mb-3 text-[13px] text-muted-foreground">
                    <Images className="mr-1 inline size-4" />
                    Building, rooms, bathrooms, kitchen and common areas. JPG, PNG or WebP up to 5
                    MB, at most {MAX_PROPERTY_PHOTOS}. The first photo is the cover.
                  </p>
                  <PhotoManager
                    photos={live.data?.photos ?? property.photos}
                    uploadPath={`/properties/${property.id}/photos/`}
                    itemPath={(photoId) => `/property-photos/${photoId}/`}
                    invalidate={PROPERTY_QUERIES}
                    max={MAX_PROPERTY_PHOTOS}
                  />
                </div>
              )}

              <ErrorAlert
                error={error}
                fields={[...Object.keys(getValues()), 'latitude', 'longitude']}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-4">
              <Button variant="ghost" disabled={step === 0} onClick={() => go(step - 1)}>
                Back
              </Button>
              <div className="flex gap-2">
                {property && !last && (
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/app/properties/${property.id}`)}
                  >
                    {editing ? 'Done' : 'Finish later'}
                  </Button>
                )}
                <Button type="submit" busy={saving}>
                  {last ? (
                    <>
                      <Sparkles /> {editing ? 'Done' : 'Finish'}
                    </>
                  ) : step === 0 && !property ? (
                    'Continue'
                  ) : (
                    'Save and continue'
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </>
  )
}
