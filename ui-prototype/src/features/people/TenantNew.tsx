/** Check-in wizard: a new tenant in seven short steps. */
import {
  Camera,
  Check,
  ChevronLeft,
  FileSignature,
  Mail,
  MessageCircle,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Avatar, DetailList, Switch } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { ChoiceCards, Segmented } from '../../components/ui-kit/choice-cards'
import { Alert, PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { GENDER } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { PayMode, Tenant } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import {
  formatDate,
  formatMoney,
  formatMonth,
  paiseToRupeesInput,
  rupeesToPaise,
} from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import {
  PAY_MODE_OPTIONS,
  TODAY,
  addDays,
  bedPlace,
  nextInvoiceNumber,
  nextReceipt,
  noteLine,
  proRata,
  statusFor,
} from './lib'
import { NoAccessGuard } from './guards'
import { BedPicker, SumRow } from './parts'

const STEPS = [
  'Personal',
  'Place',
  'Rent & deposit',
  'ID & documents',
  'Emergency & vehicle',
  'Agreement',
  'Review',
]
const ID_TYPES = ['Aadhaar (masked)', 'PAN card', 'Passport', 'Driving licence', 'Voter ID']

interface Form {
  name: string
  phone: string
  email: string
  gender: 'female' | 'male'
  dob: string
  occupation: 'working' | 'student'
  organisation: string
  homeCity: string
  photo: boolean
  propertyId: string
  bedId: string
  bedRent: number
  moveIn: string
  rent: string
  rentTouched: boolean
  food: 'yes' | 'no'
  deposit: string
  depositTouched: boolean
  depositPaid: string
  payMode: PayMode
  payRef: string
  firstRentNow: boolean
  extras: { id: string; label: string; amount: string }[]
  idType: string
  idLast4: string
  idFront: boolean
  idBack: boolean
  police: boolean
  emergencyName: string
  emergencyRelation: string
  emergencyPhone: string
  vehicle: string
  agreement: 'whatsapp' | 'email' | 'upload' | 'later'
  agreementFile: boolean
}

export function TenantNew() {
  return (
    <NoAccessGuard perm="tenants.manage" what="the check-in form">
      <Wizard />
    </NoAccessGuard>
  )
}

function Wizard() {
  useBreadcrumbs([{ label: 'Tenants', to: '/app/tenants' }, { label: 'Check in a tenant' }])
  const { person, can } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const properties = useDb((db) => db.properties)
  const beds = useDb((db) => db.beds)
  const db = useDb((d) => d)
  const money = can('rent.view')

  const [form, setForm] = useState<Form>(() => {
    const pre = beds.find((b) => b.id === params.get('bed') && b.status === 'vacant')
    const firstProperty = properties.find((p) => p.status === 'active') ?? properties[0]
    return {
      name: '',
      phone: '',
      email: '',
      gender: firstProperty?.gender === 'men' ? 'male' : 'female',
      dob: '',
      occupation: 'working',
      organisation: '',
      homeCity: '',
      photo: false,
      propertyId: pre?.propertyId ?? firstProperty?.id ?? '',
      bedId: pre?.id ?? '',
      bedRent: pre?.rent ?? 0,
      moveIn: TODAY,
      rent: '',
      rentTouched: false,
      food: 'yes',
      deposit: '',
      depositTouched: false,
      depositPaid: '',
      payMode: 'upi',
      payRef: '',
      firstRentNow: false,
      extras: [],
      idType: ID_TYPES[0]!,
      idLast4: '',
      idFront: false,
      idBack: false,
      police: true,
      emergencyName: '',
      emergencyRelation: 'Father',
      emergencyPhone: '',
      vehicle: '',
      agreement: 'whatsapp',
      agreementFile: false,
    }
  })
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const text = (k: keyof Form) => (e: { target: { value: string } }) =>
    set(k, e.target.value as never)

  const property = properties.find((p) => p.id === form.propertyId)
  const rentText = form.rentTouched
    ? form.rent
    : form.bedRent
      ? paiseToRupeesInput(form.bedRent)
      : ''
  const rent = rupeesToPaise(rentText)
  const depositText = form.depositTouched
    ? form.deposit
    : rent
      ? paiseToRupeesInput(rent * (property?.depositMonths ?? 1))
      : ''
  const deposit = rupeesToPaise(depositText)
  const depositPaid = form.depositPaid === '' ? 0 : rupeesToPaise(form.depositPaid)
  const extras = form.extras.map((x) => ({ ...x, paise: rupeesToPaise(x.amount) }))
  const pr = rent ? proRata(rent, form.moveIn || TODAY) : null
  const firstBill = (pr?.amount ?? 0) + extras.reduce((s, x) => s + (x.paise ?? 0), 0)
  const place = bedPlace(db, form.bedId)
  const phoneDigits = form.phone.replace(/\D/g, '')
  const duplicate = db.tenants.find(
    (t) => t.status !== 'moved_out' && t.phone.replace(/\D/g, '') === phoneDigits,
  )
  const isAadhaar = form.idType.startsWith('Aadhaar')

  const errors: Record<number, Record<string, string | undefined>> = {
    0: {
      name:
        form.name.trim().length < 2 ? 'Type the tenant’s full name, as on their ID.' : undefined,
      phone:
        phoneDigits.length !== 10
          ? 'Type a 10-digit mobile number, for example 98450 12345.'
          : duplicate
            ? `${duplicate.name} already uses this number. Check the number again.`
            : undefined,
      email:
        form.email && !/^\S+@\S+\.\S+$/.test(form.email)
          ? 'This email doesn’t look right. Check it or leave it empty.'
          : undefined,
      organisation: !form.organisation.trim()
        ? form.occupation === 'student'
          ? 'Type the college name.'
          : 'Type the company name.'
        : undefined,
    },
    1: {
      bed: !form.bedId ? 'Choose a free bed for the tenant.' : undefined,
      gender:
        property &&
        property.gender !== 'coed' &&
        (property.gender === 'women') !== (form.gender === 'female')
          ? `${property.name} is for ${GENDER[property.gender].toLowerCase().replace(' only', '')} only. Choose another property or check the gender on step 1.`
          : undefined,
      moveIn: !form.moveIn
        ? 'Choose the move-in date.'
        : form.moveIn < addDays(TODAY, -60)
          ? 'The move-in date is more than 2 months ago. Check the date.'
          : undefined,
    },
    2: {
      rent:
        rent === null || rent <= 0
          ? 'Type the monthly rent in rupees, for example 9500.'
          : undefined,
      deposit: deposit === null ? 'Type the deposit in rupees, or 0 if there is none.' : undefined,
      depositPaid:
        depositPaid === null
          ? 'Type the amount paid now in rupees, or leave it empty.'
          : deposit !== null && depositPaid > deposit
            ? 'The amount paid now can’t be more than the deposit.'
            : undefined,
      payRef:
        (depositPaid ?? 0) > 0 && form.payMode !== 'cash' && !form.payRef.trim()
          ? 'Type the UPI or bank reference for the amount paid now.'
          : undefined,
      extras: extras.some((x) => !x.label.trim() || x.paise === null)
        ? 'Each extra charge needs a name and an amount in rupees.'
        : undefined,
    },
    3: {
      idLast4: !form.idLast4
        ? undefined
        : isAadhaar
          ? /^\d{4}$/.test(form.idLast4)
            ? undefined
            : 'Type only the last 4 digits of the Aadhaar number.'
          : /^[A-Za-z0-9]{4}$/.test(form.idLast4)
            ? undefined
            : 'Type the last 4 letters or numbers of the ID.',
    },
    4: {
      emergencyName: !form.emergencyName.trim()
        ? 'Type the name of a family member or friend we can call.'
        : undefined,
      emergencyPhone:
        form.emergencyPhone.replace(/\D/g, '').length !== 10
          ? 'Type a 10-digit mobile number for the emergency contact.'
          : form.emergencyPhone.replace(/\D/g, '') === phoneDigits
            ? 'This is the tenant’s own number. Give someone else’s number.'
            : undefined,
    },
    5: {
      agreement:
        form.agreement === 'email' && !form.email
          ? 'Add the tenant’s email on step 1, or send the agreement on WhatsApp.'
          : form.agreement === 'upload' && !form.agreementFile
            ? 'Upload the signed agreement, or choose another option.'
            : undefined,
    },
    6: {},
  }
  const err = (s: number, k: string) => (tried ? errors[s]?.[k] : undefined)
  const stepOk = (s: number) => !Object.values(errors[s] ?? {}).some(Boolean)

  function go(to: number) {
    if (to > step) {
      for (let s = step; s < to; s++) {
        if (!stepOk(s)) {
          setStep(s)
          setTried(true)
          return
        }
      }
    }
    setTried(false)
    setStep(to)
    setReached((r) => Math.max(r, to))
    window.scrollTo(0, 0)
  }

  function checkIn() {
    const bad = STEPS.findIndex((_, i) => !stepOk(i))
    if (bad >= 0) {
      setStep(bad)
      setTried(true)
      return
    }
    if (rent === null || deposit === null || !pr) return
    setBusy(true)
    const id = newId('t')
    const upcoming = form.moveIn > TODAY
    const name = form.name.trim()
    let receipt = ''
    updateDb((d) => {
      const bed = d.beds.find((b) => b.id === form.bedId)
      if (!bed) return
      const notes: string[] = []
      if (form.police)
        notes.push(noteLine(person.name, 'Police verification form filled and submitted.'))
      if ((depositPaid ?? 0) > 0)
        notes.push(
          noteLine(
            person.name,
            `Deposit ${formatMoney(depositPaid ?? 0)} received by ${PAY_MODE_OPTIONS.find((m) => m.value === form.payMode)?.label}${form.payRef ? ` (${form.payRef.trim()})` : ''}.`,
          ),
        )
      const tenant: Tenant = {
        id,
        name,
        phone: form.phone.trim(),
        email: form.email.trim(),
        gender: form.gender,
        dob: form.dob,
        occupation: form.occupation,
        organisation: form.organisation.trim(),
        homeCity: form.homeCity.trim(),
        emergencyName: form.emergencyName.trim(),
        emergencyPhone: form.emergencyPhone.trim(),
        emergencyRelation: form.emergencyRelation.trim(),
        propertyId: bed.propertyId,
        bedId: bed.id,
        status: upcoming ? 'upcoming' : 'active',
        checkIn: form.moveIn,
        rent,
        deposit,
        depositPaid: depositPaid ?? 0,
        kyc: form.idFront && form.idLast4 ? 'pending' : 'missing',
        idType: form.idLast4 ? `${form.idType} · ${form.idLast4.toUpperCase()}` : form.idType,
        agreement:
          form.agreement === 'upload' ? 'signed' : form.agreement === 'later' ? 'not_sent' : 'sent',
        food: form.food === 'yes',
        vehicle: form.vehicle.trim() || undefined,
        photoHue: (name.length * 47) % 360,
        notes: notes.join('\n'),
      }
      d.tenants.push(tenant)
      bed.status = upcoming ? 'reserved' : 'occupied'
      bed.tenantId = id
      const lines = [
        {
          label: pr.days < pr.total ? `Rent (${pr.days} of ${pr.total} days)` : 'Rent',
          amount: pr.amount,
        },
        ...extras.map((x) => ({ label: x.label.trim(), amount: x.paise ?? 0 })),
      ]
      const total = lines.reduce((s, l) => s + l.amount, 0)
      const invId = newId('inv')
      const paid = form.firstRentNow ? total : 0
      d.invoices.unshift({
        id: invId,
        number: nextInvoiceNumber(d, pr.period),
        tenantId: id,
        propertyId: bed.propertyId,
        period: pr.period,
        issuedOn: TODAY,
        dueOn: form.moveIn,
        lines,
        total,
        paid,
        status: statusFor({ total, paid, dueOn: form.moveIn }),
      })
      if (paid) {
        receipt = nextReceipt(d)
        d.payments.unshift({
          id: newId('pay'),
          receipt,
          invoiceId: invId,
          tenantId: id,
          propertyId: bed.propertyId,
          amount: paid,
          mode: form.payMode,
          reference: form.payRef.trim() || (form.payMode === 'cash' ? 'Cash at check-in' : ''),
          paidOn: TODAY,
          collectedBy: person.name,
        })
      }
      logActivity(d, {
        kind: 'tenant',
        by: person.name,
        action: upcoming
          ? `Reserved ${bedPlace(d, bed.id)} for a new tenant moving in on ${formatDate(form.moveIn)}`
          : `Checked in a new tenant to ${bedPlace(d, bed.id)}`,
        target: name,
        propertyId: bed.propertyId,
      })
    })
    toast.success(upcoming ? `${name}'s bed is reserved` : `${name} is checked in`, {
      description: `${place} · first bill of ${formatMoney(firstBill)} made${receipt ? ` and paid (${receipt})` : ''}.`,
    })
    navigate(`/app/tenants/${id}`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/app/tenants"
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Tenants
      </Link>
      <PageHeader
        title="Check in a tenant"
        description="Takes about 3 minutes. You can fill ID and agreement later too."
      />

      <nav aria-label="Steps" className="mb-5">
        <p className="mb-2 text-[13px] text-muted-foreground sm:hidden">
          Step {step + 1} of {STEPS.length} ·{' '}
          <span className="font-medium text-foreground">{STEPS[step]}</span>
        </p>
        <ol className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={i > reached}
                onClick={() => go(i)}
                aria-current={i === step ? 'step' : undefined}
                className="group w-full text-left disabled:cursor-default"
              >
                <span
                  className={cn(
                    'block h-1.5 rounded-full',
                    i < step ? 'bg-primary' : i === step ? 'bg-primary/70' : 'bg-secondary',
                  )}
                />
                <span
                  className={cn(
                    'mt-1.5 hidden items-center gap-1 truncate text-xs sm:flex',
                    i === step ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {i < step && <Check className="size-3 text-primary" />}
                  {s}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">{STEPS[step]}</h2>

        {step === 0 && (
          <div className="grid gap-5">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => set('photo', !form.photo)}
                className={cn(
                  'flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-[11px] text-muted-foreground hover:border-primary/50',
                  form.photo && 'border-solid border-transparent p-0',
                )}
                aria-label={form.photo ? 'Remove photo' : 'Add photo'}
              >
                {form.photo ? (
                  <Avatar
                    name={form.name || 'New tenant'}
                    hue={(form.name.length * 47) % 360}
                    size="xl"
                    className="size-20 rounded-xl text-xl"
                  />
                ) : (
                  <>
                    <Camera className="size-5" /> Add photo
                  </>
                )}
              </button>
              <p className="text-[13px] text-muted-foreground">
                A clear face photo helps security staff.{' '}
                {form.photo ? 'Tap the photo to remove it.' : 'Optional.'}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required error={err(0, 'name')} className="sm:col-span-2">
                <Input
                  value={form.name}
                  onChange={text('name')}
                  placeholder="e.g. Anjali Mehta"
                  autoFocus
                />
              </Field>
              <Field
                label="Mobile number"
                required
                error={err(0, 'phone')}
                hint="Rent reminders and receipts go here on WhatsApp."
              >
                <Input
                  inputMode="tel"
                  value={form.phone}
                  onChange={text('phone')}
                  placeholder="98450 12345"
                />
              </Field>
              <Field label="Email" error={err(0, 'email')} hint="Optional">
                <Input
                  type="email"
                  value={form.email}
                  onChange={text('email')}
                  placeholder="name@gmail.com"
                />
              </Field>
              <div className="grid content-start gap-1.5">
                <span className="text-[13px] font-medium">Gender</span>
                <div>
                  <Segmented
                    label="Gender"
                    value={form.gender}
                    onChange={(v) => set('gender', v)}
                    options={[
                      { value: 'female', label: 'Female' },
                      { value: 'male', label: 'Male' },
                    ]}
                  />
                </div>
              </div>
              <Field label="Date of birth" hint="Optional">
                <Input
                  type="date"
                  value={form.dob}
                  max={addDays(TODAY, -365 * 16)}
                  onChange={text('dob')}
                />
              </Field>
              <div className="grid content-start gap-1.5">
                <span className="text-[13px] font-medium">Works or studies?</span>
                <div>
                  <Segmented
                    label="Works or studies"
                    value={form.occupation}
                    onChange={(v) => set('occupation', v)}
                    options={[
                      { value: 'working', label: 'Working' },
                      { value: 'student', label: 'Student' },
                    ]}
                  />
                </div>
              </div>
              <Field
                label={form.occupation === 'student' ? 'College' : 'Company'}
                required
                error={err(0, 'organisation')}
              >
                <Input
                  value={form.organisation}
                  onChange={text('organisation')}
                  placeholder={
                    form.occupation === 'student' ? 'e.g. Christ University' : 'e.g. Infosys'
                  }
                />
              </Field>
              <Field label="Home town" hint="Optional">
                <Input
                  value={form.homeCity}
                  onChange={text('homeCity')}
                  placeholder="e.g. Mysuru"
                />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5">
            <BedPicker
              propertyId={form.propertyId}
              onPropertyChange={(id) =>
                setForm((f) => ({ ...f, propertyId: id, bedId: '', bedRent: 0 }))
              }
              bedId={form.bedId}
              onBedChange={(id, r) => setForm((f) => ({ ...f, bedId: id, bedRent: r }))}
              error={err(1, 'bed')}
            />
            {err(1, 'gender') && <Alert tone="bad">{err(1, 'gender')}</Alert>}
            {form.bedId && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm">
                <Check className="size-4 text-primary" />
                <span>
                  <span className="font-medium">{place}</span> at {property?.name}
                  {money && <> · {formatMoney(form.bedRent)} a month</>}
                </span>
              </div>
            )}
            <Field
              label="Move-in date"
              required
              error={err(1, 'moveIn')}
              hint={
                form.moveIn > TODAY
                  ? 'In the future: the bed will be reserved until then.'
                  : undefined
              }
            >
              <Input type="date" value={form.moveIn} onChange={text('moveIn')} className="w-auto" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Monthly rent (₹)"
                required
                error={err(2, 'rent')}
                hint={form.bedRent ? `Bed rent is ${formatMoney(form.bedRent)}` : undefined}
              >
                <Input
                  inputMode="decimal"
                  value={rentText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rent: e.target.value, rentTouched: true }))
                  }
                />
              </Field>
              <div className="grid content-start gap-1.5">
                <span className="text-[13px] font-medium">Food</span>
                <div>
                  <Segmented
                    label="Food"
                    value={form.food}
                    onChange={(v) => set('food', v)}
                    options={[
                      { value: 'yes', label: 'With food' },
                      { value: 'no', label: 'No food' },
                    ]}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {property?.foodIncluded
                    ? 'Meals are included in the rent here.'
                    : 'This property doesn’t serve meals.'}
                </p>
              </div>
              <Field
                label="Deposit (₹)"
                required
                error={err(2, 'deposit')}
                hint={`${property?.depositMonths ?? 1} month${(property?.depositMonths ?? 1) > 1 ? 's' : ''} of rent at this property`}
              >
                <Input
                  inputMode="decimal"
                  value={depositText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, deposit: e.target.value, depositTouched: true }))
                  }
                />
              </Field>
              <Field
                label="Deposit paid now (₹)"
                error={err(2, 'depositPaid')}
                hint="Leave empty if nothing is paid yet."
              >
                <Input
                  inputMode="decimal"
                  value={form.depositPaid}
                  onChange={text('depositPaid')}
                  placeholder="0"
                />
              </Field>
            </div>
            {((depositPaid ?? 0) > 0 || form.firstRentNow) && (
              <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <span className="text-[13px] font-medium">Paid by</span>
                  <div>
                    <Segmented
                      label="Paid by"
                      value={form.payMode}
                      onChange={(v) => set('payMode', v)}
                      options={PAY_MODE_OPTIONS}
                    />
                  </div>
                </div>
                <Field label="Reference / UTR" error={err(2, 'payRef')}>
                  <Input
                    value={form.payRef}
                    onChange={text('payRef')}
                    placeholder={form.payMode === 'cash' ? 'Optional' : 'e.g. 431298765012'}
                  />
                </Field>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Extra monthly charges</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    set('extras', [...form.extras, { id: newId('x'), label: '', amount: '' }])
                  }
                >
                  <Plus /> Add charge
                </Button>
              </div>
              {form.extras.length === 0 && (
                <p className="text-[13px] text-muted-foreground">
                  For example parking, AC electricity or laundry.
                </p>
              )}
              <div className="grid gap-2">
                {form.extras.map((x, idx) => (
                  <div key={x.id} className="flex gap-2">
                    <Input
                      aria-label="Charge name"
                      placeholder="e.g. Two-wheeler parking"
                      value={x.label}
                      onChange={(e) =>
                        set(
                          'extras',
                          form.extras.map((y, j) =>
                            j === idx ? { ...y, label: e.target.value } : y,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label="Amount in rupees"
                      inputMode="decimal"
                      placeholder="₹"
                      className="w-28"
                      value={x.amount}
                      onChange={(e) =>
                        set(
                          'extras',
                          form.extras.map((y, j) =>
                            j === idx ? { ...y, amount: e.target.value } : y,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove charge"
                      onClick={() =>
                        set(
                          'extras',
                          form.extras.filter((_, j) => j !== idx),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              {err(2, 'extras') && (
                <p className="mt-2 text-xs font-medium text-destructive">{err(2, 'extras')}</p>
              )}
            </div>

            {pr && (
              <div className="rounded-lg border bg-secondary/40 p-4">
                <p className="mb-1 text-sm font-semibold">First bill · {formatMonth(pr.period)}</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Moving in on {formatDate(form.moveIn)}: {pr.days} of {pr.total} days ={' '}
                  {formatMoney(rent ?? 0)} × {pr.days}/{pr.total}
                </p>
                <SumRow
                  label={pr.days < pr.total ? 'Rent for the rest of the month' : 'Rent'}
                  value={formatMoney(pr.amount)}
                />
                {extras
                  .filter((x) => x.paise)
                  .map((x) => (
                    <SumRow
                      key={x.id}
                      label={x.label || 'Extra charge'}
                      value={formatMoney(x.paise ?? 0)}
                    />
                  ))}
                <div className="mt-1 border-t pt-1">
                  <SumRow label="First bill total" value={formatMoney(firstBill)} strong />
                  <SumRow
                    label="Deposit to collect"
                    value={formatMoney(Math.max(0, (deposit ?? 0) - (depositPaid ?? 0)))}
                  />
                </div>
                <Switch
                  checked={form.firstRentNow}
                  onChange={(v) => set('firstRentNow', v)}
                  label="First bill is paid now too"
                  description="A receipt is made straight away."
                />
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID type">
                <NativeSelect value={form.idType} onChange={text('idType')}>
                  {ID_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label={isAadhaar ? 'Last 4 digits of Aadhaar' : 'Last 4 characters of the ID'}
                error={err(3, 'idLast4')}
                hint="We keep only the last 4, never the full number."
              >
                <Input
                  value={form.idLast4}
                  maxLength={4}
                  inputMode={isAadhaar ? 'numeric' : 'text'}
                  onChange={text('idLast4')}
                  placeholder={isAadhaar ? '1234' : 'AB12'}
                  className="w-32 tracking-widest"
                />
              </Field>
            </div>
            {isAadhaar && (
              <Alert tone="info" title="Use a masked Aadhaar">
                Ask the tenant to cover the first 8 digits on the copy (or download the masked
                Aadhaar from the UIDAI site). Only XXXX XXXX {form.idLast4 || '1234'} should be
                readable.
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-3">
              <UploadTile
                label="Front side"
                done={form.idFront}
                onToggle={() => set('idFront', !form.idFront)}
              />
              <UploadTile
                label="Back side"
                done={form.idBack}
                onToggle={() => set('idBack', !form.idBack)}
              />
            </div>
            <div className="rounded-lg border px-4">
              <Switch
                checked={form.police}
                onChange={(v) => set('police', v)}
                label="Police verification form filled"
                description="Bengaluru police ask PGs to keep a tenant verification form for every tenant."
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Contact name"
                required
                error={err(4, 'emergencyName')}
                className="sm:col-span-2"
              >
                <Input
                  value={form.emergencyName}
                  onChange={text('emergencyName')}
                  placeholder="e.g. Ramesh Mehta"
                />
              </Field>
              <Field label="Relation">
                <NativeSelect value={form.emergencyRelation} onChange={text('emergencyRelation')}>
                  {[
                    'Father',
                    'Mother',
                    'Brother',
                    'Sister',
                    'Spouse',
                    'Relative',
                    'Friend',
                    'Guardian',
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label="Contact mobile"
                required
                error={err(4, 'emergencyPhone')}
                className="sm:col-span-2"
              >
                <Input
                  inputMode="tel"
                  value={form.emergencyPhone}
                  onChange={text('emergencyPhone')}
                  placeholder="94480 11223"
                />
              </Field>
            </div>
            <Field label="Vehicle number" hint="Optional. For the parking list.">
              <Input
                value={form.vehicle}
                onChange={text('vehicle')}
                placeholder="e.g. KA 01 EK 1234"
                className="sm:max-w-xs"
              />
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-5">
            <ChoiceCards
              label="How to get the agreement signed"
              value={form.agreement}
              onChange={(v) => set('agreement', v)}
              columns={2}
              choices={[
                {
                  value: 'whatsapp',
                  label: 'Send on WhatsApp to e-sign',
                  description: `Link goes to ${form.phone || 'the tenant’s mobile'}`,
                  icon: <MessageCircle />,
                },
                {
                  value: 'email',
                  label: 'Send by email to e-sign',
                  description: form.email || 'Add an email on step 1',
                  icon: <Mail />,
                },
                {
                  value: 'upload',
                  label: 'Upload a signed copy',
                  description: 'Signed on paper at the office',
                  icon: <Upload />,
                },
                {
                  value: 'later',
                  label: 'Do it later',
                  description: 'You can send it from the tenant page',
                  icon: <FileSignature />,
                },
              ]}
            />
            {err(5, 'agreement') && <Alert tone="bad">{err(5, 'agreement')}</Alert>}
            {form.agreement === 'upload' && (
              <div className="max-w-xs">
                <UploadTile
                  label="Signed agreement (PDF)"
                  done={form.agreementFile}
                  onToggle={() => set('agreementFile', !form.agreementFile)}
                />
              </div>
            )}
            <div className="rounded-lg border">
              <p className="border-b px-4 py-2.5 text-sm font-semibold">
                Key terms in the agreement
              </p>
              <ul className="grid gap-2 px-4 py-3 text-sm">
                <Term label="Place" value={`${place} at ${property?.name ?? ''}`} />
                {money && (
                  <Term
                    label="Monthly rent"
                    value={`${formatMoney(rent ?? 0)}${form.food === 'yes' ? ', with food' : ', without food'}`}
                  />
                )}
                {money && (
                  <Term
                    label="Deposit"
                    value={`${formatMoney(deposit ?? 0)}, refunded at check-out after any dues`}
                  />
                )}
                <Term
                  label="Rent due"
                  value={`By the ${property?.rentDueDay ?? 5}th of every month`}
                />
                <Term
                  label="Notice"
                  value={`${property?.noticeDays ?? 30} days before moving out`}
                />
                <Term label="Starts on" value={formatDate(form.moveIn)} />
                {property?.rules.slice(0, 3).map((r) => (
                  <Term key={r} label="House rule" value={r} />
                ))}
              </ul>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="grid gap-5">
            <div className="flex items-center gap-3">
              <Avatar name={form.name} hue={(form.name.length * 47) % 360} size="lg" />
              <div>
                <p className="text-base font-semibold">{form.name}</p>
                <p className="text-sm text-muted-foreground">
                  {place} · {property?.name}
                </p>
              </div>
            </div>
            <ReviewBlock title="Personal" onEdit={() => go(0)}>
              <DetailList
                items={[
                  ['Mobile', form.phone],
                  ['Email', form.email],
                  [form.occupation === 'student' ? 'College' : 'Company', form.organisation],
                  ['Home town', form.homeCity],
                ]}
                cols={2}
              />
            </ReviewBlock>
            <ReviewBlock title="Place & rent" onEdit={() => go(1)}>
              <DetailList
                items={[
                  [
                    'Moves in',
                    `${formatDate(form.moveIn)}${form.moveIn > TODAY ? ' (bed reserved till then)' : ''}`,
                  ],
                  ['Food', form.food === 'yes' ? 'With food' : 'No food'],
                  ...(money
                    ? ([
                        ['Monthly rent', formatMoney(rent ?? 0)],
                        [
                          'Deposit',
                          `${formatMoney(deposit ?? 0)} · ${formatMoney(depositPaid ?? 0)} paid now`,
                        ],
                        [
                          'First bill',
                          `${formatMoney(firstBill)}${form.firstRentNow ? ' · paid now' : ` · due ${formatDate(form.moveIn)}`}`,
                        ],
                      ] as [string, string][])
                    : []),
                ]}
                cols={2}
              />
            </ReviewBlock>
            <ReviewBlock title="ID, contact & agreement" onEdit={() => go(3)}>
              <DetailList
                items={[
                  [
                    'ID',
                    form.idLast4
                      ? `${form.idType} · ending ${form.idLast4}`
                      : `${form.idType} · not added`,
                  ],
                  [
                    'ID copies',
                    form.idFront || form.idBack
                      ? `${[form.idFront && 'front', form.idBack && 'back'].filter(Boolean).join(' & ')} uploaded`
                      : 'Not uploaded',
                  ],
                  ['Police verification', form.police ? 'Form filled' : 'Not yet'],
                  [
                    'Emergency contact',
                    `${form.emergencyName} (${form.emergencyRelation}) · ${form.emergencyPhone}`,
                  ],
                  ['Vehicle', form.vehicle],
                  [
                    'Agreement',
                    {
                      whatsapp: 'Sent on WhatsApp to e-sign',
                      email: 'Sent by email to e-sign',
                      upload: 'Signed copy uploaded',
                      later: 'Not sent yet',
                    }[form.agreement],
                  ],
                ]}
                cols={2}
              />
            </ReviewBlock>
            {(!form.idFront || !form.idLast4) && (
              <Alert tone="warn" title="ID not complete">
                You can still check in. The tenant will show “No ID yet” until you add it.
              </Alert>
            )}
          </div>
        )}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <Button
          variant="outline"
          onClick={() => (step === 0 ? navigate('/app/tenants') : go(step - 1))}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => go(step + 1)}>Next: {STEPS[step + 1]}</Button>
        ) : (
          <Button onClick={checkIn} busy={busy}>
            <ShieldCheck /> {form.moveIn > TODAY ? 'Reserve bed' : 'Check in'}
          </Button>
        )}
      </div>
    </div>
  )
}

function UploadTile({
  label,
  done,
  onToggle,
}: {
  label: string
  done: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex aspect-[3/2] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-3 text-center text-[13px] transition-colors',
        done
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'text-muted-foreground hover:border-primary/50 hover:bg-secondary/50',
      )}
    >
      {done ? <Check className="size-5" /> : <Upload className="size-5" />}
      <span className="font-medium">{label}</span>
      <span className="text-[11px]">
        {done ? 'Uploaded · tap to remove' : 'Tap to upload a photo or PDF'}
      </span>
    </button>
  )
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex gap-3">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 font-medium">{value}</span>
    </li>
  )
}

function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <Button size="sm" variant="link" onClick={onEdit}>
          Change
        </Button>
      </div>
      {children}
    </div>
  )
}
