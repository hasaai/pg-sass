/** Add / edit a tenant, check in, move, notice, deposit, checkout and agreement terms. */
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { UseFormReturn } from 'react-hook-form'
import { z } from 'zod'

import { api } from '../../api/client'
import { useApiMutation } from '../../api/hooks'
import type { Stay, Tenant } from '../../api/types'
import { Button } from '../../components/ui-kit/button'
import { CheckboxRow } from '../../components/ui-kit/checkbox'
import { Dialog } from '../../components/ui-kit/dialog'
import { ErrorAlert } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { formatMoney, paiseToRupeesInput, rupeesToPaise, todayISO } from '../../lib/format'
import { applyServerErrors, rupeesField, toPaiseOrNull } from '../../lib/forms'
import { TENANT_QUERIES, placeBody, useStayAction } from './api'
import type { FreePlace } from './api'
import { GENDERS, ID_TYPES, deductionsTotal } from './labels'
import type { Deduction } from './labels'
import { PlacePicker } from './PlacePicker'

const mobile = z
  .string()
  .trim()
  .refine((v) => /^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/.test(v), {
    message: 'Enter a 10-digit mobile number, e.g. 98450 12345.',
  })
const optionalMobile = z
  .string()
  .trim()
  .refine((v) => v === '' || /^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/.test(v), {
    message: 'Enter a 10-digit mobile number, or leave it empty.',
  })

/* ------------------------------------------------------------- move-in terms */

const moveInSchema = {
  check_in: z.string().min(1, 'Choose the move-in date.'),
  monthly_rent: rupeesField('the rent'),
  deposit_amount: rupeesField('the deposit'),
  deposit_collected: rupeesField('the deposit collected'),
}

type MoveInValues = {
  check_in: string
  monthly_rent: string
  deposit_amount: string
  deposit_collected: string
}

function moveInDefaults(): MoveInValues {
  return { check_in: todayISO(), monthly_rent: '', deposit_amount: '', deposit_collected: '' }
}

function moveInBody(v: MoveInValues, place: FreePlace) {
  const body: Record<string, unknown> = {
    ...placeBody(place.kind, place.id),
    check_in: v.check_in,
    deposit_amount: toPaiseOrNull(v.deposit_amount) ?? 0,
    deposit_collected: toPaiseOrNull(v.deposit_collected) ?? 0,
  }
  const rent = toPaiseOrNull(v.monthly_rent)
  if (rent !== null) body.monthly_rent = rent
  return body
}

/** Check-in date, rent (defaults to the place's rent) and deposit. */
function MoveInFields<T extends MoveInValues>({
  form,
  place,
}: {
  form: UseFormReturn<T>
  place: FreePlace | null
}) {
  const f = form as unknown as UseFormReturn<MoveInValues>
  const err = (k: keyof MoveInValues) => f.formState.errors[k]?.message
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Move-in date" required error={err('check_in')}>
        <Input type="date" {...f.register('check_in')} />
      </Field>
      <Field
        label="Rent per month (₹)"
        hint={place ? `Leave empty to use ${formatMoney(place.monthly_rent)}` : undefined}
        error={err('monthly_rent')}
      >
        <Input
          inputMode="decimal"
          placeholder={place ? paiseToRupeesInput(place.monthly_rent) : 'e.g. 9000'}
          {...f.register('monthly_rent')}
        />
      </Field>
      <Field
        label="Security deposit (₹)"
        hint={place?.deposit ? `Usual deposit: ${formatMoney(place.deposit)}` : undefined}
        error={err('deposit_amount')}
      >
        <Input inputMode="decimal" placeholder="e.g. 18000" {...f.register('deposit_amount')} />
      </Field>
      <Field label="Deposit paid now (₹)" error={err('deposit_collected')}>
        <Input inputMode="decimal" placeholder="0" {...f.register('deposit_collected')} />
      </Field>
    </div>
  )
}

/* ------------------------------------------------------------- tenant form */

const tenantSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the tenant’s full name.').max(150),
  phone: mobile,
  email: z.union([
    z.literal(''),
    z.string().trim().email('Enter a valid email, or leave it empty.'),
  ]),
  gender: z.string(),
  date_of_birth: z.string(),
  occupation: z.string().max(100),
  home_address: z.string().max(500),
  id_type: z.string(),
  id_last4: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[A-Za-z0-9]{4}$/.test(v), {
      message: 'Enter only the last 4 characters of the ID.',
    }),
  emergency_contact_name: z.string().max(150),
  emergency_contact_phone: optionalMobile,
  notes: z.string(),
  consent: z.boolean(),
  move_in: z.boolean(),
  ...moveInSchema,
})
type TenantValues = z.infer<typeof tenantSchema>

function tenantDefaults(t?: Tenant | null): TenantValues {
  return {
    full_name: t?.full_name ?? '',
    phone: t?.phone ?? '',
    email: t?.email ?? '',
    gender: t?.gender ?? '',
    date_of_birth: t?.date_of_birth ?? '',
    occupation: t?.occupation ?? '',
    home_address: t?.home_address ?? '',
    id_type: t?.id_type ?? '',
    id_last4: t?.id_last4 ?? '',
    emergency_contact_name: t?.emergency_contact_name ?? '',
    emergency_contact_phone: t?.emergency_contact_phone ?? '',
    notes: t?.notes ?? '',
    consent: Boolean(t?.consent_given_at),
    move_in: false,
    ...moveInDefaults(),
  }
}

/**
 * Add a tenant (and, optionally, check them in on the same screen) or edit their details.
 * `onSaved` gets the tenant once it exists.
 */
export function TenantDialog({
  open,
  onOpenChange,
  tenant,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenant?: Tenant | null
  onSaved?: (t: Tenant) => void
}) {
  const editing = Boolean(tenant)
  const form = useForm<TenantValues>({
    resolver: zodResolver(tenantSchema),
    values: tenantDefaults(tenant),
  })
  const { register, control, handleSubmit, formState, setValue } = form
  const moveIn = useWatch({ control, name: 'move_in' })
  const consent = useWatch({ control, name: 'consent' })
  const [propertyId, setPropertyId] = useState('')
  const [place, setPlace] = useState<FreePlace | null>(null)
  const [placeError, setPlaceError] = useState<string>()
  const [stayError, setStayError] = useState<unknown>(null)
  const err = (k: keyof TenantValues) => formState.errors[k]?.message

  const save = useApiMutation(async (v: TenantValues) => {
    const body = {
      full_name: v.full_name.trim(),
      phone: v.phone,
      email: v.email,
      gender: v.gender,
      date_of_birth: v.date_of_birth || null,
      occupation: v.occupation.trim(),
      home_address: v.home_address.trim(),
      id_type: v.id_type,
      id_last4: v.id_last4,
      emergency_contact_name: v.emergency_contact_name.trim(),
      emergency_contact_phone: v.emergency_contact_phone,
      notes: v.notes,
      ...(editing ? {} : { consent: v.consent }),
    }
    const saved = tenant
      ? await api.patch<Tenant>(`/tenants/${tenant.id}/`, body)
      : await api.post<Tenant>('/tenants/', body)
    let stayFailed: unknown = null
    if (!editing && v.move_in && place) {
      try {
        await api.post<Stay>('/stays/', { tenant: saved.id, ...moveInBody(v, place) })
      } catch (e) {
        stayFailed = e
      }
    }
    return { saved, stayFailed }
  }, TENANT_QUERIES)

  function close() {
    onOpenChange(false)
    form.reset()
    setPropertyId('')
    setPlace(null)
    setStayError(null)
  }

  function onSubmit(v: TenantValues) {
    if (!editing && !v.consent) {
      form.setError('consent', { message: 'The tenant must agree to how their details are used.' })
      return
    }
    if (!editing && v.move_in && !place) {
      setPlaceError('Choose where the tenant will stay, or untick “Check in now”.')
      return
    }
    save.mutate(v, {
      onSuccess: ({ saved, stayFailed }) => {
        if (stayFailed) {
          setStayError(stayFailed)
          toast.error(`${saved.full_name} was added, but not checked in.`)
          onSaved?.(saved)
          return
        }
        toast.success(
          editing
            ? 'Details saved'
            : v.move_in && place
              ? `${saved.full_name} checked in to ${place.label}`
              : `${saved.full_name} added`,
        )
        close()
        onSaved?.(saved)
      },
      onError: (e) => applyServerErrors(form, e),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      variant="side"
      title={editing ? `Edit ${tenant?.full_name}` : 'Add tenant'}
      description={
        editing
          ? 'Change the tenant’s details. Their stay is changed from the tenant page.'
          : 'Only the name and mobile are needed now; the rest can be filled in later.'
      }
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="tenant-form" busy={save.isPending}>
            {editing ? 'Save details' : moveIn ? 'Add and check in' : 'Add tenant'}
          </Button>
        </>
      }
    >
      <form id="tenant-form" noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
        <ErrorAlert
          error={save.error}
          fields={Object.keys(tenantDefaults()).filter((k) => !k.startsWith('move'))}
        />
        <section className="grid gap-4">
          <Field label="Full name" required error={err('full_name')}>
            <Input autoComplete="off" {...register('full_name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile" required error={err('phone')}>
              <Input type="tel" inputMode="tel" placeholder="98450 12345" {...register('phone')} />
            </Field>
            <Field label="Email" error={err('email')}>
              <Input type="email" {...register('email')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gender" error={err('gender')}>
              <NativeSelect {...register('gender')}>
                <option value="">Not given</option>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Date of birth" error={err('date_of_birth')}>
              <Input type="date" {...register('date_of_birth')} />
            </Field>
          </div>
          <Field label="Job or college" error={err('occupation')}>
            <Input placeholder="e.g. Software engineer at Infosys" {...register('occupation')} />
          </Field>
          <Field label="Home address" hint="Their permanent address" error={err('home_address')}>
            <Textarea rows={2} {...register('home_address')} />
          </Field>
        </section>

        <section className="grid gap-4 border-t pt-5">
          <h3 className="text-sm font-semibold">ID and emergency contact</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID proof" error={err('id_type')}>
              <NativeSelect {...register('id_type')}>
                <option value="">Not given</option>
                {ID_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Last 4 characters of the ID"
              hint="Only these are kept, never the full number."
              error={err('id_last4')}
            >
              <Input maxLength={4} autoComplete="off" {...register('id_last4')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Emergency contact name" error={err('emergency_contact_name')}>
              <Input placeholder="e.g. Father, Raghu" {...register('emergency_contact_name')} />
            </Field>
            <Field label="Emergency contact mobile" error={err('emergency_contact_phone')}>
              <Input type="tel" inputMode="tel" {...register('emergency_contact_phone')} />
            </Field>
          </div>
          <Field label="Notes" hint="Only your team sees these." error={err('notes')}>
            <Textarea rows={2} {...register('notes')} />
          </Field>
        </section>

        {!editing && (
          <section className="grid gap-4 border-t pt-5">
            <CheckboxRow
              label="Check in now"
              hint="Give them a bed, a room or a flat straight away."
              checked={moveIn}
              onCheckedChange={(c) => {
                setValue('move_in', c === true)
                setPlaceError(undefined)
              }}
            />
            {moveIn && (
              <>
                <PlacePicker
                  propertyId={propertyId}
                  onPropertyChange={setPropertyId}
                  value={place}
                  onChange={(p) => {
                    setPlace(p)
                    setPlaceError(undefined)
                  }}
                  error={placeError}
                />
                <MoveInFields form={form} place={place} />
                <ErrorAlert error={stayError} />
              </>
            )}
          </section>
        )}

        {!tenant?.consent_given_at && (
          <section className="border-t pt-5">
            <CheckboxRow
              label="The tenant agrees that we keep these details to manage their stay, rent and safety."
              checked={consent}
              onCheckedChange={(c) => setValue('consent', c === true, { shouldValidate: false })}
            />
            {err('consent') && (
              <p className="mt-1.5 text-xs font-medium text-destructive" role="alert">
                {err('consent')}
              </p>
            )}
          </section>
        )}
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------- check in / move */

const checkInSchema = z.object(moveInSchema)

export function CheckInDialog({
  open,
  onOpenChange,
  tenant,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenant: Tenant
}) {
  const form = useForm<MoveInValues>({
    resolver: zodResolver(checkInSchema),
    values: moveInDefaults(),
  })
  const [propertyId, setPropertyId] = useState('')
  const [place, setPlace] = useState<FreePlace | null>(null)
  const [placeError, setPlaceError] = useState<string>()
  const save = useApiMutation(
    (body: Record<string, unknown>) => api.post<Stay>('/stays/', body),
    TENANT_QUERIES,
  )
  function onSubmit(v: MoveInValues) {
    if (!place) {
      setPlaceError('Choose where the tenant will stay.')
      return
    }
    save.mutate(
      { tenant: tenant.id, ...moveInBody(v, place) },
      {
        onSuccess: () => {
          toast.success(`${tenant.full_name} checked in to ${place.label}`)
          onOpenChange(false)
        },
        onError: (e) => applyServerErrors(form, e),
      },
    )
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      variant="side"
      title={`Check in ${tenant.full_name}`}
      description="Choose a free bed, a whole room or a whole flat."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="checkin-form" busy={save.isPending}>
            Check in
          </Button>
        </>
      }
    >
      <form
        id="checkin-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-5"
      >
        <ErrorAlert error={save.error} fields={Object.keys(moveInDefaults())} />
        <PlacePicker
          propertyId={propertyId}
          onPropertyChange={setPropertyId}
          value={place}
          onChange={(p) => {
            setPlace(p)
            setPlaceError(undefined)
          }}
          error={placeError}
        />
        <MoveInFields form={form} place={place} />
      </form>
    </Dialog>
  )
}

export function MoveDialog({
  open,
  onOpenChange,
  stay,
  tenantName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stay: Stay
  tenantName: string
}) {
  const [propertyId, setPropertyId] = useState(stay.place.property_id)
  const [place, setPlace] = useState<FreePlace | null>(null)
  const [rent, setRent] = useState('')
  const [problem, setProblem] = useState<string>()
  const current = stay.bed?.id ?? stay.place.room_id ?? stay.place.unit_id ?? undefined
  const move = useStayAction<Record<string, unknown>>(stay, 'transfer', () => {
    toast.success(`${tenantName} moved to ${place?.label}`)
    onOpenChange(false)
  })
  function submit() {
    if (!place) return setProblem('Choose where to move them.')
    const paise = rent.trim() ? rupeesToPaise(rent) : null
    if (rent.trim() && paise === null) return setProblem('New rent: enter rupees, e.g. 9500.')
    move.mutate({
      ...placeBody(place.kind, place.id),
      ...(paise !== null && { monthly_rent: paise }),
    })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      variant="side"
      title={`Move ${tenantName}`}
      description={`Now in ${stay.place.property_name} · ${stay.place.label}. Their deposit and rent history stay with them.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button busy={move.isPending} onClick={submit}>
            Move tenant
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <ErrorAlert error={move.error} />
        <PlacePicker
          propertyId={propertyId}
          onPropertyChange={setPropertyId}
          value={place}
          onChange={(p) => {
            setPlace(p)
            setProblem(undefined)
          }}
          excludeId={current}
          error={problem}
        />
        <Field
          label="New rent per month (₹)"
          hint={place ? `Leave empty to use ${formatMoney(place.monthly_rent)}` : undefined}
        >
          <Input inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------- notice */

export function NoticeDialog({
  open,
  onOpenChange,
  stay,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stay: Stay
}) {
  const [noticeDate, setNoticeDate] = useState(todayISO())
  const [leaving, setLeaving] = useState('')
  const notice = useStayAction(stay, 'notice', () => {
    toast.success('Notice recorded')
    onOpenChange(false)
  })
  const suggested = (() => {
    const d = new Date(`${noticeDate}T00:00:00`)
    d.setDate(d.getDate() + stay.notice_period_days)
    return d.toISOString().slice(0, 10)
  })()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tenant is leaving"
      description={`Their agreement asks for ${stay.notice_period_days} days’ notice.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            busy={notice.isPending}
            onClick={() =>
              notice.mutate({ notice_date: noticeDate, expected_checkout: leaving || suggested })
            }
          >
            Record notice
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <ErrorAlert error={notice.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Told you on">
            <Input type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} />
          </Field>
          <Field label="Leaving on" hint={leaving ? undefined : 'End of the notice period'}>
            <Input
              type="date"
              value={leaving || suggested}
              onChange={(e) => setLeaving(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------- deposit */

export function DepositDialog({
  open,
  onOpenChange,
  stay,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stay: Stay
}) {
  const due = Math.max(0, stay.deposit_amount - stay.deposit_held)
  const [amount, setAmount] = useState(due ? paiseToRupeesInput(due) : '')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string>()
  const collect = useStayAction(stay, 'deposit', () => {
    toast.success('Deposit recorded')
    onOpenChange(false)
  })
  function submit() {
    const paise = rupeesToPaise(amount)
    if (!paise) return setProblem('Enter the amount in rupees, e.g. 9000.')
    collect.mutate({ amount: paise, date, note })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Collect deposit"
      description={`Agreed ${formatMoney(stay.deposit_amount)} · already paid ${formatMoney(stay.deposit_held)}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button busy={collect.isPending} onClick={submit}>
            Record deposit
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <ErrorAlert error={collect.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" required error={problem}>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setProblem(undefined)
              }}
            />
          </Field>
          <Field label="Paid on">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Note">
          <Input
            placeholder="e.g. UPI, ref 4471"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------- checkout */

export function CheckoutDialog({
  open,
  onOpenChange,
  stay,
  tenantName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stay: Stay
  tenantName: string
}) {
  const [date, setDate] = useState(stay.expected_checkout ?? todayISO())
  const [rows, setRows] = useState<Deduction[]>([])
  const [problem, setProblem] = useState<string>()
  const checkout = useStayAction(stay, 'checkout', () => {
    toast.success(`${tenantName} checked out`)
    onOpenChange(false)
  })
  const deducted = deductionsTotal(rows)
  const refund = Number.isNaN(deducted) ? null : stay.deposit_held - deducted
  function submit() {
    const filled = rows.filter((r) => r.reason.trim() || r.amount.trim())
    if (filled.some((r) => !r.reason.trim() || !rupeesToPaise(r.amount)))
      return setProblem('Each deduction needs a reason and an amount in rupees.')
    if (refund !== null && refund < 0)
      return setProblem('Deductions are more than the deposit held.')
    checkout.mutate({
      check_out: date,
      deductions: filled.map((r) => ({ reason: r.reason.trim(), amount: rupeesToPaise(r.amount) })),
    })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      variant="side"
      title={`Check out ${tenantName}`}
      description={`${stay.place.property_name} · ${stay.place.label} becomes free.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" busy={checkout.isPending} onClick={submit}>
            Check out
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <ErrorAlert error={checkout.error} />
        <Field label="Leaving on">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Deductions from the deposit</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRows([...rows, { reason: '', amount: '' }])}
            >
              <Plus /> Add
            </Button>
          </div>
          {rows.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              None. Add one for damage, unpaid rent or cleaning.
            </p>
          )}
          {rows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label="Reason" className="flex-1">
                <Input
                  value={r.reason}
                  placeholder="e.g. Broken chair"
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))
                  }
                />
              </Field>
              <Field label="Amount (₹)" className="w-32">
                <Input
                  inputMode="decimal"
                  value={r.amount}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                  }
                />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove deduction ${i + 1}`}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <dl className="grid gap-1.5 rounded-lg border bg-secondary/40 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Deposit held</dt>
            <dd className="tabular-nums">{formatMoney(stay.deposit_held)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Deductions</dt>
            <dd className="tabular-nums">{Number.isNaN(deducted) ? '—' : formatMoney(deducted)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <dt>Give back to the tenant</dt>
            <dd className="tabular-nums">
              {refund === null ? '—' : formatMoney(Math.max(0, refund))}
            </dd>
          </div>
        </dl>
        {problem && (
          <p className="text-xs font-medium text-destructive" role="alert">
            {problem}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Make the last month’s rent from Rent &amp; payments; it is charged only up to the leaving
          date.
        </p>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------- agreement terms */

export function TermsDialog({
  open,
  onOpenChange,
  stay,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stay: Stay
}) {
  const [notice, setNotice] = useState(String(stay.notice_period_days))
  const [lockIn, setLockIn] = useState(String(stay.lock_in_months))
  const [end, setEnd] = useState(stay.agreement_end ?? '')
  const save = useStayAction(stay, 'terms', () => {
    toast.success('Terms saved')
    onOpenChange(false)
  })
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Stay terms"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            busy={save.isPending}
            onClick={() =>
              save.mutate({
                notice_period_days: Number(notice) || 0,
                lock_in_months: Number(lockIn) || 0,
                agreement_end: end || null,
              })
            }
          >
            Save terms
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <ErrorAlert error={save.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Notice period (days)">
            <Input
              type="number"
              min={0}
              max={180}
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
            />
          </Field>
          <Field label="Lock-in (months)" hint="Minimum stay">
            <Input
              type="number"
              min={0}
              max={36}
              value={lockIn}
              onChange={(e) => setLockIn(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Agreement ends on">
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}
