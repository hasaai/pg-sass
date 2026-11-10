import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Building,
  Building2,
  Check,
  Hotel,
  ImagePlus,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'

import { DetailList, PhotoTile, Switch } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { ChoiceCards } from '../../components/ui-kit/choice-cards'
import { Alert, EmptyState } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { GENDER, PROPERTY_TYPE } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Gender, Property } from '../../data/types'
import { useSession } from '../../demo/session'
import { NoAccess } from '../../components/common'
import { cn } from '../../lib/cn'
import { formatMoney, paiseToRupeesInput, plural, rupeesToPaise } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { AmenityEditor } from './AmenityEditor'
import { MapPlaceholder } from './bits'
import { amenityName, extra, newReference } from './lib'
import type { PropertyX } from './lib'

interface Form {
  type: Property['type'] | ''
  gender: Gender | ''
  name: string
  address: string
  locality: string
  landmark: string
  city: string
  pincode: string
  contactPhone: string
  pinned: boolean
  floors: string
  yearBuilt: string
  foodIncluded: boolean
  description: string
  rentDueDay: string
  depositMonths: string
  noticeDays: string
  lateFee: string
  amenities: string[]
  photos: Property['photos']
  rules: string[]
}

type Errors = Partial<Record<keyof Form, string>>

const STEPS = [
  { title: 'Type of place', hint: 'What it is and who can stay' },
  { title: 'Name & location', hint: 'Where tenants will find it' },
  { title: 'Building', hint: 'Floors, food and a short description' },
  { title: 'Rent rules', hint: 'Due day, deposit and notice' },
  { title: 'Amenities', hint: 'What the place offers' },
  { title: 'Photos', hint: 'Show the rooms and common areas' },
  { title: 'House rules', hint: 'What tenants must follow' },
  { title: 'Review & save', hint: 'Check everything once' },
]

const RULE_SUGGESTIONS = [
  'Gate closes at 10:30 pm',
  'No visitors in rooms',
  'No smoking or alcohol',
  'Inform the warden before staying out at night',
  'Keep the common areas clean',
  'Quiet hours 11 pm – 7 am',
  'Switch off lights and fans when leaving the room',
  'No cooking in rooms',
  'Pets are not allowed',
]

const PHOTO_IDEAS = [
  'Front of the building',
  'Room',
  'Bathroom',
  'Dining area',
  'Common area',
  'Terrace',
]

function emptyForm(): Form {
  return {
    type: '',
    gender: '',
    name: '',
    address: '',
    locality: '',
    landmark: '',
    city: 'Bengaluru',
    pincode: '',
    contactPhone: '',
    pinned: false,
    floors: '3',
    yearBuilt: '',
    foodIncluded: true,
    description: '',
    rentDueDay: '5',
    depositMonths: '2',
    noticeDays: '30',
    lateFee: '100',
    amenities: ['wifi', 'power_backup', 'ro_water', 'cctv'],
    photos: [],
    rules: ['No smoking or alcohol', 'Keep the common areas clean'],
  }
}

function fromProperty(p: Property): Form {
  const x = extra(p)
  return {
    type: p.type,
    gender: p.gender,
    name: p.name,
    address: p.address,
    locality: p.locality,
    landmark: p.landmark,
    city: p.city,
    pincode: p.pincode,
    contactPhone: p.contactPhone,
    pinned: true,
    floors: String(p.floors),
    yearBuilt: x.yearBuilt ?? '',
    foodIncluded: p.foodIncluded,
    description: p.description,
    rentDueDay: String(p.rentDueDay),
    depositMonths: String(p.depositMonths),
    noticeDays: String(p.noticeDays),
    lateFee: paiseToRupeesInput(x.lateFeePerDay ?? 10000),
    amenities: [...p.amenities],
    photos: p.photos.map((ph) => ({ ...ph })),
    rules: [...p.rules],
  }
}

const isInt = (v: string, min: number, max: number) =>
  /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max

function validate(step: number, f: Form): Errors {
  const e: Errors = {}
  if (step === 0) {
    if (!f.type) e.type = 'Choose what kind of place this is.'
    if (!f.gender) e.gender = 'Choose who can stay here.'
  }
  if (step === 1) {
    if (f.name.trim().length < 3)
      e.name = 'Type the name tenants know your place by, e.g. Sunrise Women’s PG.'
    if (!f.address.trim()) e.address = 'Type the door number and street.'
    if (!f.locality.trim()) e.locality = 'Type the area, e.g. HSR Layout.'
    if (!f.city.trim()) e.city = 'Type the city.'
    if (!/^\d{6}$/.test(f.pincode.trim())) e.pincode = 'Pincode has 6 digits, e.g. 560102.'
    if (f.contactPhone.trim() && f.contactPhone.replace(/\D/g, '').length !== 10)
      e.contactPhone = 'Mobile number has 10 digits, e.g. 98450 12345.'
  }
  if (step === 2) {
    if (!isInt(f.floors, 1, 30)) e.floors = 'Type how many floors have rooms, from 1 to 30.'
    if (f.yearBuilt.trim() && !isInt(f.yearBuilt, 1900, 2026))
      e.yearBuilt = 'Type a year like 2015, or leave it empty.'
    if (f.description.length > 600) e.description = 'Keep it under 600 letters.'
  }
  if (step === 3) {
    if (!isInt(f.rentDueDay, 1, 28)) e.rentDueDay = 'Pick a day from 1 to 28.'
    if (!isInt(f.depositMonths, 0, 6)) e.depositMonths = 'Type 0 to 6 months.'
    if (!isInt(f.noticeDays, 0, 90)) e.noticeDays = 'Type 0 to 90 days.'
    if (f.lateFee.trim() && rupeesToPaise(f.lateFee) === null)
      e.lateFee = 'Type an amount in rupees, e.g. 100.'
  }
  return e
}

export function PropertyWizard() {
  const { id } = useParams()
  const { can } = useSession()
  const navigate = useNavigate()
  const existing = useDb((db) => (id ? db.properties.find((p) => p.id === id) : undefined))
  const roomCount = useDb((db) => (id ? db.rooms.filter((r) => r.propertyId === id).length : 0))
  const editing = Boolean(id)
  useBreadcrumbs(
    editing
      ? [
          { label: 'Properties', to: '/app/properties' },
          { label: existing?.name ?? 'Property', to: `/app/properties/${id}` },
          { label: 'Edit details' },
        ]
      : [{ label: 'Properties', to: '/app/properties' }, { label: 'Add property' }],
  )

  const [form, setForm] = useState<Form>(() => (existing ? fromProperty(existing) : emptyForm()))
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(editing ? STEPS.length - 1 : 0)
  const [errors, setErrors] = useState<Errors>({})
  const [newRule, setNewRule] = useState('')

  if (!can('properties.manage')) return <NoAccess what="adding or changing properties" />
  if (editing && !existing)
    return (
      <EmptyState
        icon={<Building2 />}
        title="Property not found"
        actions={<Button onClick={() => navigate('/app/properties')}>Back to properties</Button>}
      >
        It may have been removed.
      </EmptyState>
    )

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function go(to: number) {
    if (to > step) {
      for (let s = step; s < to; s++) {
        const e = validate(s, form)
        if (Object.keys(e).length) {
          setStep(s)
          setErrors(e)
          return
        }
      }
    }
    setErrors({})
    setStep(to)
    setReached((r) => Math.max(r, to))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function save(asDraft: boolean) {
    if (asDraft) {
      if (form.name.trim().length < 3) {
        setStep(1)
        setErrors({ name: 'Give the place a name before saving the draft.' })
        return
      }
    } else {
      for (let s = 0; s < STEPS.length - 1; s++) {
        const e = validate(s, form)
        if (Object.keys(e).length) {
          setStep(s)
          setErrors(e)
          toast.error(`Please fix “${STEPS[s]!.title}” first.`)
          return
        }
      }
    }
    const values = {
      type: form.type || 'pg',
      gender: form.gender || 'coed',
      name: form.name.trim(),
      address: form.address.trim(),
      locality: form.locality.trim(),
      landmark: form.landmark.trim(),
      city: form.city.trim() || 'Bengaluru',
      pincode: form.pincode.trim(),
      contactPhone: form.contactPhone.trim(),
      floors: isInt(form.floors, 1, 30) ? Number(form.floors) : 1,
      foodIncluded: form.foodIncluded,
      description: form.description.trim(),
      rentDueDay: isInt(form.rentDueDay, 1, 28) ? Number(form.rentDueDay) : 5,
      depositMonths: isInt(form.depositMonths, 0, 6) ? Number(form.depositMonths) : 2,
      noticeDays: isInt(form.noticeDays, 0, 90) ? Number(form.noticeDays) : 30,
      amenities: form.amenities,
      photos: form.photos,
      rules: form.rules,
    } satisfies Partial<Property>
    const more = {
      yearBuilt: form.yearBuilt.trim() || undefined,
      lateFeePerDay: rupeesToPaise(form.lateFee) ?? 0,
    }

    if (existing) {
      updateDb((db) => {
        db.properties = db.properties.map((p) =>
          p.id === existing.id ? ({ ...p, ...values, ...more } as PropertyX) : p,
        )
        logActivity(db, {
          kind: 'property',
          action: 'Changed the property details',
          target: values.name,
          propertyId: existing.id,
        })
      })
      toast.success(asDraft ? 'Changes saved' : `${values.name} saved`)
      navigate(`/app/properties/${existing.id}`)
      return
    }
    const pid = newId('p')
    const created: PropertyX = {
      id: pid,
      reference: newReference(),
      status: 'draft',
      verification: 'unverified',
      documents: [],
      createdOn: TODAY,
      ...values,
      ...more,
    }
    updateDb((db) => {
      db.properties = [...db.properties, created]
      logActivity(db, {
        kind: 'property',
        action: asDraft ? 'Saved a new property as a draft' : 'Added a new property',
        target: values.name,
        propertyId: pid,
      })
    })
    toast.success(
      asDraft
        ? `${values.name} saved as a draft`
        : `${values.name} added. Now add its rooms and beds.`,
    )
    navigate(`/app/properties/${pid}${asDraft ? '' : '?tab=rooms'}`)
  }

  const progress = Math.round(((step + 1) / STEPS.length) * 100)
  const last = step === STEPS.length - 1

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {editing ? `Edit ${existing!.name}` : 'Add a property'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {editing
              ? 'Change any step and save. Rooms and beds are changed on the Rooms & beds tab.'
              : 'Takes about 5 minutes. You can save as a draft and finish later.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => save(true)}>
          <Save /> {editing ? 'Save changes' : 'Save as draft'}
        </Button>
      </div>

      {/* Phone: progress bar */}
      <div className="mb-4 lg:hidden">
        <div className="mb-1.5 flex justify-between text-[13px]">
          <span className="font-medium">
            Step {step + 1} of {STEPS.length} · {STEPS[step]!.title}
          </span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <nav aria-label="Steps" className="hidden lg:block">
          <ol className="sticky top-20 grid gap-0.5 rounded-xl border bg-card p-2 shadow-xs">
            {STEPS.map((s, i) => {
              const done = i < step || (i <= reached && i !== step)
              const open = i <= reached
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    disabled={!open}
                    onClick={() => go(i)}
                    aria-current={i === step ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      i === step ? 'bg-accent' : open ? 'hover:bg-secondary' : 'opacity-60',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                        i === step
                          ? 'border-primary bg-primary text-primary-foreground'
                          : done
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'bg-card text-muted-foreground',
                      )}
                    >
                      {done && i !== step ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="block text-xs text-muted-foreground">{s.hint}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <section className="rounded-xl border bg-card shadow-xs">
          <header className="border-b px-5 py-4 md:px-6">
            <p className="text-xs font-medium text-primary">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold">{STEPS[step]!.title}</h2>
            <p className="text-[13px] text-muted-foreground">{STEPS[step]!.hint}</p>
          </header>
          <div className="px-5 py-5 md:px-6">
            {Object.values(errors).some(Boolean) && (
              <Alert tone="bad" className="mb-5" title="A few things need fixing">
                Look for the red messages below.
              </Alert>
            )}
            {step === 0 && <StepType form={form} set={set} errors={errors} />}
            {step === 1 && <StepLocation form={form} set={set} errors={errors} />}
            {step === 2 && <StepBuilding form={form} set={set} errors={errors} />}
            {step === 3 && <StepRent form={form} set={set} errors={errors} />}
            {step === 4 && (
              <div className="grid gap-3">
                <p className="text-[13px] text-muted-foreground">
                  {plural(form.amenities.length, 'amenity', 'amenities')} chosen. Tenants see these
                  on your listing.
                </p>
                <AmenityEditor value={form.amenities} onChange={(v) => set('amenities', v)} />
              </div>
            )}
            {step === 5 && <StepPhotos form={form} set={set} />}
            {step === 6 && (
              <StepRules form={form} set={set} newRule={newRule} setNewRule={setNewRule} />
            )}
            {step === 7 && (
              <StepReview form={form} goTo={go} editing={editing} roomCount={roomCount} />
            )}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 md:px-6">
            <Button
              variant="ghost"
              onClick={() =>
                step === 0
                  ? navigate(editing ? `/app/properties/${id}` : '/app/properties')
                  : go(step - 1)
              }
            >
              <ArrowLeft /> {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            <div className="flex flex-wrap gap-2">
              {!last && (
                <Button
                  variant="outline"
                  className="hidden sm:inline-flex"
                  onClick={() => save(true)}
                >
                  {editing ? 'Save changes' : 'Save as draft'}
                </Button>
              )}
              {last ? (
                <Button onClick={() => save(false)}>
                  <Check /> {editing ? 'Save property' : 'Add property'}
                </Button>
              ) : (
                <Button onClick={() => go(step + 1)}>
                  Next: {STEPS[step + 1]!.title} <ArrowRight />
                </Button>
              )}
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}

interface StepProps {
  form: Form
  set: <K extends keyof Form>(key: K, value: Form[K]) => void
  errors: Errors
}

function StepType({ form, set, errors }: StepProps) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p className="text-sm font-medium">What kind of place is it?</p>
        <ChoiceCards
          label="Kind of place"
          columns={2}
          value={form.type}
          onChange={(v) => set('type', v)}
          choices={[
            {
              value: 'pg',
              label: PROPERTY_TYPE.pg,
              description: 'Rooms rented bed by bed, usually with food.',
              icon: <Building2 />,
            },
            {
              value: 'hostel',
              label: 'Hostel',
              description: 'For students, often near a college, with a warden.',
              icon: <Hotel />,
            },
            {
              value: 'coliving',
              label: 'Co-living',
              description: 'Furnished rooms with shared kitchen and lounge.',
              icon: <Users />,
            },
            {
              value: 'apartment',
              label: 'Apartment / flats',
              description: 'Whole flats or rooms inside flats.',
              icon: <Building />,
            },
          ]}
        />
        {errors.type && <p className="text-xs font-medium text-destructive">{errors.type}</p>}
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Who can stay?</p>
        <ChoiceCards
          label="Who can stay"
          value={form.gender}
          onChange={(v) => set('gender', v)}
          choices={[
            { value: 'women', label: GENDER.women, description: 'Working women and students.' },
            { value: 'men', label: GENDER.men, description: 'Working men and students.' },
            { value: 'coed', label: GENDER.coed, description: 'Men and women, separate rooms.' },
          ]}
        />
        {errors.gender && <p className="text-xs font-medium text-destructive">{errors.gender}</p>}
      </div>
    </div>
  )
}

function StepLocation({ form, set, errors }: StepProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Name of the place"
        required
        error={errors.name}
        hint="As it appears on the board outside."
        className="sm:col-span-2"
      >
        <Input
          value={form.name}
          placeholder="Sunrise Women’s PG"
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>
      <Field
        label="Door number and street"
        required
        error={errors.address}
        className="sm:col-span-2"
      >
        <Input
          value={form.address}
          placeholder="12, 5th Cross, 27th Main, Sector 2"
          onChange={(e) => set('address', e.target.value)}
        />
      </Field>
      <Field label="Area / locality" required error={errors.locality}>
        <Input
          value={form.locality}
          placeholder="HSR Layout"
          onChange={(e) => set('locality', e.target.value)}
        />
      </Field>
      <Field label="Landmark" hint="Helps tenants find you.">
        <Input
          value={form.landmark}
          placeholder="Near BDA Complex"
          onChange={(e) => set('landmark', e.target.value)}
        />
      </Field>
      <Field label="City" required error={errors.city}>
        <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
      </Field>
      <Field label="Pincode" required error={errors.pincode}>
        <Input
          inputMode="numeric"
          maxLength={6}
          value={form.pincode}
          placeholder="560102"
          onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
        />
      </Field>
      <Field
        label="Contact number for this place"
        hint="Shown to tenants and people asking about rooms."
        error={errors.contactPhone}
      >
        <Input
          inputMode="tel"
          value={form.contactPhone}
          placeholder="98450 12345"
          onChange={(e) => set('contactPhone', e.target.value)}
        />
      </Field>
      <div className="grid gap-1.5 sm:col-span-2">
        <p className="text-[13px] font-medium">Location on the map</p>
        <MapPlaceholder
          pinned={form.pinned}
          label={form.name || form.locality || 'Your building'}
          onSearch={() => {
            if (!form.locality.trim() && !form.address.trim()) {
              toast.error('Type the address or area first, then search.')
              return
            }
            set('pinned', true)
            toast.success(`Pin placed near ${form.landmark || form.locality || form.address}`)
          }}
        />
        <p className="text-xs text-muted-foreground">
          Drag the pin later if it is not exactly on your gate.
        </p>
      </div>
    </div>
  )
}

function StepBuilding({ form, set, errors }: StepProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Floors with rooms"
        required
        error={errors.floors}
        hint="Count the floors above the ground floor that have rooms."
      >
        <Input
          inputMode="numeric"
          value={form.floors}
          onChange={(e) => set('floors', e.target.value)}
        />
      </Field>
      <Field label="Year built" error={errors.yearBuilt} hint="Optional.">
        <Input
          inputMode="numeric"
          placeholder="2015"
          value={form.yearBuilt}
          onChange={(e) => set('yearBuilt', e.target.value)}
        />
      </Field>
      <div className="rounded-lg border px-4 py-2 sm:col-span-2">
        <Switch
          checked={form.foodIncluded}
          onChange={(v) => set('foodIncluded', v)}
          label="Food is included in the rent"
          description="Breakfast, lunch and dinner served at the PG."
        />
      </div>
      <Field
        label="Short description"
        error={errors.description}
        hint={`${form.description.length} / 600 · What makes your place good to stay in?`}
        className="sm:col-span-2"
      >
        <Textarea
          rows={4}
          value={form.description}
          placeholder="Safe, clean PG for working women, 5 minutes from the metro. Home-style food, daily cleaning and 24×7 security."
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>
    </div>
  )
}

function StepRent({ form, set, errors }: StepProps) {
  const deposit = Number(form.depositMonths)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Rent is due on" required error={errors.rentDueDay} hint="Day of every month.">
        <NativeSelect value={form.rentDueDay} onChange={(e) => set('rentDueDay', e.target.value)}>
          {Array.from({ length: 28 }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>
              {i + 1}
              {i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} of the month
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Deposit (months of rent)" required error={errors.depositMonths}>
        <Input
          inputMode="numeric"
          value={form.depositMonths}
          onChange={(e) => set('depositMonths', e.target.value)}
        />
      </Field>
      <Field label="Notice to move out (days)" required error={errors.noticeDays}>
        <Input
          inputMode="numeric"
          value={form.noticeDays}
          onChange={(e) => set('noticeDays', e.target.value)}
        />
      </Field>
      <Field
        label="Late fee per day (₹)"
        error={errors.lateFee}
        hint="Added when rent is paid late. 0 for none."
      >
        <Input
          inputMode="numeric"
          value={form.lateFee}
          onChange={(e) => set('lateFee', e.target.value)}
        />
      </Field>
      <Alert tone="info" className="sm:col-span-2">
        For a bed at ₹9,000 a month, the tenant pays a deposit of{' '}
        <strong>{Number.isFinite(deposit) ? formatMoney(900000 * deposit) : '—'}</strong> and gives{' '}
        {form.noticeDays || '0'} days notice before leaving.
      </Alert>
    </div>
  )
}

function StepPhotos({ form, set }: Omit<StepProps, 'errors'>) {
  const photos = form.photos
  const move = (i: number, d: number) => {
    const next = [...photos]
    const [p] = next.splice(i, 1)
    next.splice(i + d, 0, p!)
    set('photos', next)
  }
  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-muted-foreground">
        Add at least 3 photos. The first one is the cover photo shown on cards and your listing.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {photos.map((ph, i) => (
          <div key={ph.id} className="overflow-hidden rounded-xl border bg-card">
            <div className="relative">
              <PhotoTile hue={ph.hue} className="rounded-none" />
              {i === 0 && (
                <Badge tone="good" className="absolute top-2 left-2">
                  <Star /> Cover
                </Badge>
              )}
            </div>
            <div className="grid gap-2 p-2">
              <Input
                aria-label={`Caption of photo ${i + 1}`}
                className="h-8 text-[13px]"
                value={ph.caption}
                placeholder="Caption"
                onChange={(e) =>
                  set(
                    'photos',
                    photos.map((p) => (p.id === ph.id ? { ...p, caption: e.target.value } : p)),
                  )
                }
              />
              <div className="flex flex-wrap items-center gap-1">
                {i !== 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => set('photos', [ph, ...photos.filter((p) => p.id !== ph.id)])}
                  >
                    <Star /> Set cover
                  </Button>
                )}
                <span className="flex-1" />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-7"
                  aria-label="Move earlier"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-7"
                  aria-label="Move later"
                  disabled={i === photos.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-7 text-destructive"
                  aria-label="Remove photo"
                  onClick={() =>
                    set(
                      'photos',
                      photos.filter((p) => p.id !== ph.id),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const caption = PHOTO_IDEAS[photos.length % PHOTO_IDEAS.length]!
            set('photos', [
              ...photos,
              { id: newId('ph'), caption, hue: Math.floor(Math.random() * 360) },
            ])
            toast.success('Photo added')
          }}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-primary"
        >
          <ImagePlus className="size-7" />
          <span className="text-sm font-medium">Add photos</span>
          <span className="text-xs">JPG or PNG, up to 10 MB</span>
        </button>
      </div>
    </div>
  )
}

function StepRules({
  form,
  set,
  newRule,
  setNewRule,
}: Omit<StepProps, 'errors'> & { newRule: string; setNewRule: (v: string) => void }) {
  const [editing, setEditing] = useState<number | null>(null)
  const add = (text: string) => {
    const t = text.trim()
    if (!t) return
    if (form.rules.some((r) => r.toLowerCase() === t.toLowerCase())) {
      toast.error('This rule is already in the list.')
      return
    }
    set('rules', [...form.rules, t])
    setNewRule('')
  }
  const suggestions = RULE_SUGGESTIONS.filter((s) => !form.rules.includes(s))
  return (
    <div className="grid gap-5">
      <ul className="grid gap-2">
        {form.rules.length === 0 && (
          <li className="rounded-lg border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground">
            No rules yet. Add your own or pick from the suggestions below.
          </li>
        )}
        {form.rules.map((r, i) => (
          <li
            key={`${r}-${i}`}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
              {i + 1}
            </span>
            {editing === i ? (
              <Input
                autoFocus
                aria-label={`Rule ${i + 1}`}
                className="h-8"
                defaultValue={r}
                onBlur={(e) => {
                  const t = e.target.value.trim()
                  set(
                    'rules',
                    t
                      ? form.rules.map((x, j) => (j === i ? t : x))
                      : form.rules.filter((_, j) => j !== i),
                  )
                  setEditing(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <span className="min-w-0 flex-1 text-sm">{r}</span>
            )}
            {editing !== i && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Edit rule ${i + 1}`}
                onClick={() => setEditing(i)}
              >
                <Pencil />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive"
              aria-label={`Remove rule ${i + 1}`}
              onClick={() =>
                set(
                  'rules',
                  form.rules.filter((_, j) => j !== i),
                )
              }
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add(newRule)
        }}
      >
        <Input
          aria-label="New rule"
          placeholder="Type a rule, e.g. Gate closes at 11 pm"
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!newRule.trim()}>
          <Plus /> Add
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] text-muted-foreground">Common rules (tap to add)</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed bg-card px-3 py-1 text-[13px] hover:border-primary/50 hover:bg-accent"
              >
                <Plus className="size-3.5" /> {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ReviewBlock({
  title,
  step,
  goTo,
  children,
}: {
  title: string
  step: number
  goTo: (s: number) => void
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border">
      <div className="flex items-center justify-between border-b bg-secondary/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button size="sm" variant="ghost" onClick={() => goTo(step)}>
          <Pencil /> Change
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function StepReview({
  form,
  goTo,
  editing,
  roomCount,
}: {
  form: Form
  goTo: (s: number) => void
  editing: boolean
  roomCount: number
}) {
  return (
    <div className="grid gap-4">
      {!editing && (
        <Alert tone="info" title="Next: add rooms and beds">
          The property is saved as <strong>Not finished</strong> until it has rooms. You will go
          straight to the Rooms & beds screen.
        </Alert>
      )}
      {editing && roomCount === 0 && (
        <Alert tone="warn" title="This property has no rooms yet">
          Add rooms on the Rooms & beds tab to open it for tenants.
        </Alert>
      )}
      <ReviewBlock title="Type of place" step={0} goTo={goTo}>
        <DetailList
          cols={2}
          items={[
            ['Kind', form.type ? PROPERTY_TYPE[form.type] : ''],
            ['Who can stay', form.gender ? GENDER[form.gender] : ''],
          ]}
        />
      </ReviewBlock>
      <ReviewBlock title="Name & location" step={1} goTo={goTo}>
        <DetailList
          cols={2}
          items={[
            ['Name', form.name],
            [
              'Address',
              [form.address, form.locality, form.city, form.pincode].filter(Boolean).join(', '),
            ],
            ['Landmark', form.landmark],
            ['Contact number', form.contactPhone],
          ]}
        />
      </ReviewBlock>
      <ReviewBlock title="Building" step={2} goTo={goTo}>
        <DetailList
          cols={2}
          items={[
            ['Floors with rooms', form.floors],
            ['Year built', form.yearBuilt],
            ['Food', form.foodIncluded ? 'Included in rent' : 'Not included'],
            ['Description', form.description],
          ]}
        />
      </ReviewBlock>
      <ReviewBlock title="Rent rules" step={3} goTo={goTo}>
        <DetailList
          cols={2}
          items={[
            ['Rent due', `${form.rentDueDay} of every month`],
            ['Deposit', `${form.depositMonths} months of rent`],
            ['Notice to move out', `${form.noticeDays} days`],
            [
              'Late fee',
              form.lateFee ? `${formatMoney(rupeesToPaise(form.lateFee) ?? 0)} a day` : 'None',
            ],
          ]}
        />
      </ReviewBlock>
      <ReviewBlock title={`Amenities (${form.amenities.length})`} step={4} goTo={goTo}>
        <div className="flex flex-wrap gap-1.5">
          {form.amenities.length ? (
            form.amenities.map((a) => (
              <Badge key={a} tone="outline">
                {amenityName(a)}
              </Badge>
            ))
          ) : (
            <span className="text-[13px] text-muted-foreground">None chosen</span>
          )}
        </div>
      </ReviewBlock>
      <ReviewBlock title={`Photos (${form.photos.length})`} step={5} goTo={goTo}>
        {form.photos.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {form.photos.map((p) => (
              <PhotoTile key={p.id} hue={p.hue} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-amber-700">
            No photos yet. Places with photos fill faster.
          </p>
        )}
      </ReviewBlock>
      <ReviewBlock title={`House rules (${form.rules.length})`} step={6} goTo={goTo}>
        <ul className="list-inside list-disc text-sm">
          {form.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
          {form.rules.length === 0 && (
            <li className="list-none text-muted-foreground">No rules added</li>
          )}
        </ul>
      </ReviewBlock>
    </div>
  )
}
