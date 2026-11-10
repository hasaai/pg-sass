/** Dialogs that change a tenant's stay: move bed, notice, check out, edit, mark as moved in. */
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Money, Switch } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { CheckboxRow } from '../../components/ui-kit/checkbox'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { Alert } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { balance, placeLabel } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { PayMode } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import {
  formatDate,
  formatMoney,
  formatMonth,
  paiseToRupeesInput,
  rupeesToPaise,
} from '../../lib/format'
import {
  PAY_MODE_OPTIONS,
  TODAY,
  addDays,
  bedPlace,
  daysBetween,
  nextInvoiceNumber,
  noteLine,
  statusFor,
} from './lib'
import { RecordPaymentDialog } from './money-dialogs'
import { BedPicker, SumRow } from './parts'

export type TenantAction = {
  kind: 'pay' | 'move' | 'notice' | 'cancel_notice' | 'checkout' | 'edit' | 'movein'
  tenantId: string
} | null

/** Renders whichever tenant dialog is asked for. */
export function TenantActionDialogs({
  action,
  onClose,
}: {
  action: TenantAction
  onClose: () => void
}) {
  if (!action) return null
  const key = `${action.kind}-${action.tenantId}`
  switch (action.kind) {
    case 'pay':
      return <RecordPaymentDialog key={key} tenantId={action.tenantId} onClose={onClose} />
    case 'move':
      return <MoveBedDialog key={key} tenantId={action.tenantId} onClose={onClose} />
    case 'notice':
      return <GiveNoticeDialog key={key} tenantId={action.tenantId} onClose={onClose} />
    case 'cancel_notice':
      return <CancelNoticeDialog key={key} tenantId={action.tenantId} onClose={onClose} />
    case 'checkout':
      return <CheckOutDialog key={key} tenantId={action.tenantId} onClose={onClose} />
    case 'edit':
      return <EditTenantDialog key={key} tenantId={action.tenantId} onClose={onClose} />
    case 'movein':
      return <MoveInDialog key={key} tenantId={action.tenantId} onClose={onClose} />
  }
}

function useTenant(id: string) {
  return useDb((db) => db.tenants.find((t) => t.id === id))
}

/* ---------------------------------------------------------------- move to another bed */

function MoveBedDialog({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { person } = useSession()
  const t = useTenant(tenantId)
  const db = useDb((d) => d)
  const [propertyId, setPropertyId] = useState(t?.propertyId ?? '')
  const [bedId, setBedId] = useState('')
  const [newRent, setNewRent] = useState(0)
  const [from, setFrom] = useState(TODAY)
  const [useNewRent, setUseNewRent] = useState(true)
  const [tried, setTried] = useState(false)
  if (!t) return null
  const fromPlace = placeLabel(db, t)
  const toPlace = bedPlace(db, bedId)
  const rentAfter = bedId && useNewRent ? newRent : t.rent
  const diff = rentAfter - t.rent
  const error = !bedId ? 'Choose a free bed to move to.' : undefined

  function save() {
    setTried(true)
    if (error || !t) return
    updateDb((d) => {
      const tenant = d.tenants.find((x) => x.id === tenantId)
      if (!tenant) return
      const oldBed = d.beds.find((b) => b.id === tenant.bedId)
      const newBed = d.beds.find((b) => b.id === bedId)
      if (!newBed) return
      if (oldBed) {
        oldBed.status = 'vacant'
        oldBed.tenantId = undefined
      }
      newBed.status =
        tenant.status === 'notice'
          ? 'notice'
          : tenant.status === 'upcoming'
            ? 'reserved'
            : 'occupied'
      newBed.tenantId = tenant.id
      tenant.bedId = newBed.id
      tenant.propertyId = newBed.propertyId
      if (useNewRent) tenant.rent = newBed.rent
      tenant.notes = [
        tenant.notes,
        noteLine(person.name, `Moved from ${fromPlace} to ${toPlace} from ${formatDate(from)}.`),
      ]
        .filter(Boolean)
        .join('\n')
      logActivity(d, {
        kind: 'tenant',
        by: person.name,
        action: `Moved a tenant from ${fromPlace} to ${toPlace}`,
        target: tenant.name,
        propertyId: newBed.propertyId,
      })
    })
    toast.success(`${t.name} moved to ${toPlace}`, {
      description: diff
        ? `Rent is now ${formatMoney(rentAfter)} a month from the next bill.`
        : undefined,
    })
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      className="max-w-2xl"
      title="Move to another bed"
      description={`${t.name} is now in ${fromPlace}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Move tenant</Button>
        </>
      }
    >
      <div className="grid gap-5">
        <BedPicker
          propertyId={propertyId}
          onPropertyChange={(id) => {
            setPropertyId(id)
            setBedId('')
          }}
          bedId={bedId}
          onBedChange={(id, rent) => {
            setBedId(id)
            setNewRent(rent)
          }}
          excludeBedId={t.bedId}
          error={tried ? error : undefined}
        />
        <Field label="Moving from" hint="The old bed becomes free on this date.">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-auto"
          />
        </Field>
        <div className="rounded-lg border bg-secondary/40 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span>{fromPlace}</span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className={cn(!bedId && 'text-muted-foreground')}>
              {bedId ? toPlace : 'Choose a bed'}
            </span>
          </div>
          <div className="mt-3">
            <SumRow label="Rent now" value={formatMoney(t.rent)} />
            {bedId && <SumRow label="Rent of the new bed" value={formatMoney(newRent)} />}
            <SumRow
              label="Rent after the move"
              value={`${formatMoney(rentAfter)}${diff ? ` (${diff > 0 ? '+' : '−'}${formatMoney(Math.abs(diff))})` : ''}`}
              strong
              tone={diff > 0 ? 'bad' : diff < 0 ? 'good' : undefined}
            />
          </div>
          {bedId && newRent !== t.rent && (
            <Switch
              checked={useNewRent}
              onChange={setUseNewRent}
              label="Charge the new bed’s rent"
              description="Turn off to keep the current rent for this tenant."
            />
          )}
        </div>
      </div>
    </Dialog>
  )
}

/* ---------------------------------------------------------------- notice */

function GiveNoticeDialog({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { person } = useSession()
  const t = useTenant(tenantId)
  const property = useDb((db) => db.properties.find((p) => p.id === t?.propertyId))
  const noticeDays = property?.noticeDays ?? 30
  const [given, setGiven] = useState(TODAY)
  const [moveOut, setMoveOut] = useState(addDays(TODAY, noticeDays))
  const [touched, setTouched] = useState(false)
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  if (!t) return null
  const out = touched ? moveOut : addDays(given, noticeDays)
  const days = given && out ? daysBetween(given, out) : 0
  const error = !out
    ? 'Choose the move-out date.'
    : out < given
      ? 'The move-out date must be after the date notice was given.'
      : undefined

  function save() {
    setTried(true)
    if (error || !t) return
    updateDb((d) => {
      const tenant = d.tenants.find((x) => x.id === tenantId)
      if (!tenant) return
      tenant.status = 'notice'
      tenant.noticeGivenOn = given
      tenant.moveOutOn = out
      if (reason.trim())
        tenant.notes = [tenant.notes, noteLine(person.name, `Notice: ${reason.trim()}`)]
          .filter(Boolean)
          .join('\n')
      const bed = d.beds.find((b) => b.id === tenant.bedId)
      if (bed) bed.status = 'notice'
      logActivity(d, {
        kind: 'tenant',
        by: person.name,
        action: `Recorded notice to move out on ${formatDate(out)}`,
        target: tenant.name,
        propertyId: tenant.propertyId,
      })
    })
    toast.success(`Notice recorded. ${t.name.split(' ')[0]} moves out on ${formatDate(out)}`)
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Give notice"
      description={`${t.name} · ${property?.name ?? ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Record notice</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Notice given on" required>
            <Input
              type="date"
              value={given}
              max={TODAY}
              onChange={(e) => setGiven(e.target.value)}
            />
          </Field>
          <Field
            label="Moving out on"
            required
            hint={`${noticeDays}-day notice at this property`}
            error={tried ? error : undefined}
          >
            <Input
              type="date"
              value={out}
              onChange={(e) => {
                setMoveOut(e.target.value)
                setTouched(true)
              }}
            />
          </Field>
        </div>
        {days > 0 && days < noticeDays && (
          <Alert tone="warn" title={`Only ${days} days of notice`}>
            The rule here is {noticeDays} days. You can take rent for the missing days from the
            deposit at check-out.
          </Alert>
        )}
        <Field label="Reason (optional)">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Moving to Pune for a new job"
          />
        </Field>
      </div>
    </Dialog>
  )
}

function CancelNoticeDialog({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { person } = useSession()
  const t = useTenant(tenantId)
  if (!t) return null
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Cancel the notice?"
      confirmLabel="Cancel notice"
      onConfirm={() => {
        updateDb((d) => {
          const tenant = d.tenants.find((x) => x.id === tenantId)
          if (!tenant) return
          tenant.status = 'active'
          tenant.noticeGivenOn = undefined
          tenant.moveOutOn = undefined
          const bed = d.beds.find((b) => b.id === tenant.bedId)
          if (bed) bed.status = 'occupied'
          logActivity(d, {
            kind: 'tenant',
            by: person.name,
            action: 'Cancelled the notice to move out',
            target: tenant.name,
            propertyId: tenant.propertyId,
          })
        })
        toast.success(`${t.name} is staying on. Notice cancelled`)
        onClose()
      }}
    >
      <p>
        {t.name} will be shown as staying again and the bed will no longer be listed as becoming
        free on {formatDate(t.moveOutOn)}.
      </p>
    </ConfirmDialog>
  )
}

/* ---------------------------------------------------------------- check out */

function CheckOutDialog({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { person, can } = useSession()
  const t = useTenant(tenantId)
  const db = useDb((d) => d)
  const [step, setStep] = useState(0)
  const [moveOut, setMoveOut] = useState(
    t?.moveOutOn && t.moveOutOn < addDays(TODAY, 45) ? t.moveOutOn : TODAY,
  )
  const [damages, setDamages] = useState<{ id: string; label: string; amount: string }[]>([])
  const [refundMode, setRefundMode] = useState<PayMode>('upi')
  const [markVacant, setMarkVacant] = useState(true)
  const [tried, setTried] = useState(false)
  if (!t) return null
  const unpaid = db.invoices.filter((i) => i.tenantId === t.id && i.status !== 'paid')
  const pending = unpaid.reduce((s, i) => s + balance(i), 0)
  const damageRows = damages.map((d) => ({ ...d, paise: rupeesToPaise(d.amount) }))
  const damageTotal = damageRows.reduce((s, d) => s + (d.paise ?? 0), 0)
  const deposit = t.depositPaid
  const net = pending + damageTotal - deposit
  const place = placeLabel(db, t)
  const damageError = damageRows.some((d) => !d.label.trim() || d.paise === null)
    ? 'Each damage line needs a description and an amount in rupees.'
    : undefined
  const steps = ['Move-out date', 'Final bill', 'Settle & finish']

  function next() {
    setTried(true)
    if (step === 1 && damageError) return
    setTried(false)
    setStep((s) => s + 1)
  }

  function finish() {
    if (!t) return
    const tenantName = t.name
    updateDb((d) => {
      const tenant = d.tenants.find((x) => x.id === tenantId)
      if (!tenant) return
      if (damageTotal > 0) {
        const lines = damageRows.map((r) => ({
          label: `Damage: ${r.label.trim()}`,
          amount: r.paise ?? 0,
        }))
        d.invoices.unshift({
          id: newId('inv'),
          number: nextInvoiceNumber(d, moveOut.slice(0, 7)),
          tenantId: tenant.id,
          propertyId: tenant.propertyId,
          period: moveOut.slice(0, 7),
          issuedOn: TODAY,
          dueOn: moveOut,
          lines,
          total: damageTotal,
          paid: 0,
          status: statusFor({ total: damageTotal, paid: 0, dueOn: moveOut }),
        })
      }
      let pool = tenant.depositPaid
      const open = d.invoices
        .filter((i) => i.tenantId === tenant.id && i.status !== 'paid')
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      for (const inv of open) {
        const use = Math.min(pool, inv.total - inv.paid)
        if (use <= 0) continue
        inv.lines = [...inv.lines, { label: 'Adjusted from deposit', amount: -use }]
        inv.total -= use
        inv.status = statusFor(inv)
        pool -= use
      }
      const used = tenant.depositPaid - pool
      const bed = d.beds.find((b) => b.id === tenant.bedId)
      if (bed) {
        bed.status = markVacant ? 'vacant' : 'blocked'
        bed.tenantId = undefined
      }
      const summary = `Checked out of ${place} on ${formatDate(moveOut)}. Deposit ${formatMoney(tenant.depositPaid)}: ${formatMoney(used)} adjusted against bills${pool > 0 ? `, ${formatMoney(pool)} refunded by ${PAY_MODE_OPTIONS.find((m) => m.value === refundMode)?.label}` : ''}.${net > 0 ? ` ${formatMoney(net)} still to collect.` : ''}`
      tenant.notes = [tenant.notes, noteLine(person.name, summary)].filter(Boolean).join('\n')
      tenant.status = 'moved_out'
      tenant.moveOutOn = moveOut
      tenant.bedId = undefined
      tenant.depositPaid = 0
      logActivity(d, {
        kind: 'tenant',
        by: person.name,
        action: `Checked out a tenant from ${place}`,
        target: tenant.name,
        propertyId: tenant.propertyId,
      })
      if (pool > 0)
        logActivity(d, {
          kind: 'rent',
          by: person.name,
          action: `Refunded deposit of ${formatMoney(pool)}`,
          target: tenant.name,
          propertyId: tenant.propertyId,
        })
    })
    toast.success(`${tenantName} checked out`, {
      description:
        net < 0
          ? `Refund ${formatMoney(-net)} to the tenant.`
          : net > 0
            ? `${formatMoney(net)} is still to be collected.`
            : 'All settled.',
    })
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title="Check out"
      description={`${t.name} · ${place}`}
      footer={
        <>
          <Button variant="outline" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < 2 ? (
            <Button onClick={next}>Next</Button>
          ) : (
            <Button variant="destructive" onClick={finish}>
              Check out {t.name.split(' ')[0]}
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-5 flex gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={cn('h-1 rounded-full', i <= step ? 'bg-primary' : 'bg-secondary')} />
            <p
              className={cn('mt-1.5 text-xs', i === step ? 'font-medium' : 'text-muted-foreground')}
            >
              {s}
            </p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-4">
          <Field
            label="Move-out date"
            required
            hint={
              t.moveOutOn
                ? `Notice says ${formatDate(t.moveOutOn)}`
                : 'No notice was recorded for this tenant.'
            }
          >
            <Input
              type="date"
              value={moveOut}
              onChange={(e) => setMoveOut(e.target.value)}
              className="w-auto"
            />
          </Field>
          {!t.noticeGivenOn && (
            <Alert tone="warn" title="Leaving without notice">
              You may keep rent for the notice period from the deposit. Add it as a line on the next
              step.
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            Check the room with the tenant before you finish: keys, furniture, and the electricity
            meter reading.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-5">
          {can('rent.view') && (
            <div>
              <p className="mb-2 text-sm font-semibold">Unpaid bills</p>
              {unpaid.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unpaid bills. </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {unpaid.map((i) => (
                    <div key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>
                        {formatMonth(i.period)} ·{' '}
                        <span className="text-muted-foreground">{i.number}</span>
                      </span>
                      <Money value={balance(i)} className="font-medium" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Damages and other deductions</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDamages([...damages, { id: newId('dmg'), label: '', amount: '' }])
                }
              >
                <Plus /> Add line
              </Button>
            </div>
            {damages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing added. Add a line for broken items, cleaning or notice-period rent.
              </p>
            )}
            <div className="grid gap-2">
              {damages.map((row, idx) => (
                <div key={row.id} className="flex gap-2">
                  <Input
                    aria-label="What was damaged"
                    placeholder="e.g. Broken chair"
                    value={row.label}
                    onChange={(e) =>
                      setDamages(
                        damages.map((d, j) => (j === idx ? { ...d, label: e.target.value } : d)),
                      )
                    }
                  />
                  <Input
                    aria-label="Amount in rupees"
                    inputMode="decimal"
                    placeholder="₹"
                    className="w-28"
                    value={row.amount}
                    onChange={(e) =>
                      setDamages(
                        damages.map((d, j) => (j === idx ? { ...d, amount: e.target.value } : d)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    onClick={() => setDamages(damages.filter((_, j) => j !== idx))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            {tried && damageError && (
              <p className="mt-2 text-xs font-medium text-destructive">{damageError}</p>
            )}
          </div>
          {can('rent.view') && (
            <FinalSum pending={pending} damages={damageTotal} deposit={deposit} />
          )}
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-5">
          {can('rent.view') && (
            <FinalSum pending={pending} damages={damageTotal} deposit={deposit} />
          )}
          {net < 0 && (
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium">Refund {formatMoney(-net)} by</span>
              <div>
                <Segmented
                  label="Refund by"
                  value={refundMode}
                  onChange={setRefundMode}
                  options={PAY_MODE_OPTIONS}
                />
              </div>
            </div>
          )}
          {net > 0 && (
            <Alert tone="warn" title={`Collect ${formatMoney(net)} from ${t.name.split(' ')[0]}`}>
              The deposit doesn’t cover everything. The balance stays on the bills so you can record
              it later.
            </Alert>
          )}
          <CheckboxRow
            checked={markVacant}
            onCheckedChange={(v) => setMarkVacant(v === true)}
            label="Mark the bed as free for new tenants"
            hint="Untick to keep it ‘Not available’ for cleaning or repairs."
          />
          <p className="text-sm text-muted-foreground">
            {t.name} will be shown as moved out from {formatDate(moveOut)}. Their bills, payments
            and documents are kept.
          </p>
        </div>
      )}
    </Dialog>
  )
}

function FinalSum({
  pending,
  damages,
  deposit,
}: {
  pending: number
  damages: number
  deposit: number
}) {
  const net = pending + damages - deposit
  return (
    <div className="rounded-lg border bg-secondary/40 p-4">
      <SumRow label="Pending rent and charges" value={formatMoney(pending)} />
      <SumRow label="Damages and deductions" value={`+ ${formatMoney(damages)}`} />
      <SumRow label="Deposit held" value={`− ${formatMoney(deposit)}`} />
      <div className="mt-1 border-t pt-1">
        <SumRow
          label={net < 0 ? 'Refund to tenant' : net > 0 ? 'Collect from tenant' : 'All settled'}
          value={formatMoney(Math.abs(net))}
          strong
          tone={net < 0 ? 'good' : net > 0 ? 'bad' : undefined}
        />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- edit */

function EditTenantDialog({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { person, can } = useSession()
  const t = useTenant(tenantId)
  const [f, setF] = useState(() => ({
    name: t?.name ?? '',
    phone: t?.phone ?? '',
    email: t?.email ?? '',
    occupation: t?.occupation ?? 'working',
    organisation: t?.organisation ?? '',
    homeCity: t?.homeCity ?? '',
    emergencyName: t?.emergencyName ?? '',
    emergencyRelation: t?.emergencyRelation ?? '',
    emergencyPhone: t?.emergencyPhone ?? '',
    vehicle: t?.vehicle ?? '',
    food: t?.food ?? true,
    rent: t ? paiseToRupeesInput(t.rent) : '',
  }))
  const [tried, setTried] = useState(false)
  if (!t) return null
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value })
  const rent = rupeesToPaise(f.rent)
  const errors = {
    name: f.name.trim().length < 2 ? 'Type the tenant’s full name.' : undefined,
    phone: f.phone.replace(/\D/g, '').length !== 10 ? 'Type a 10-digit mobile number.' : undefined,
    email:
      f.email && !/^\S+@\S+\.\S+$/.test(f.email)
        ? 'This email doesn’t look right. Check it or leave it empty.'
        : undefined,
    rent: rent === null || rent <= 0 ? 'Type the monthly rent in rupees.' : undefined,
  }

  function save() {
    setTried(true)
    if (Object.values(errors).some(Boolean) || rent === null) return
    updateDb((d) => {
      const x = d.tenants.find((y) => y.id === tenantId)
      if (!x) return
      Object.assign(x, {
        name: f.name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim(),
        occupation: f.occupation,
        organisation: f.organisation.trim(),
        homeCity: f.homeCity.trim(),
        emergencyName: f.emergencyName.trim(),
        emergencyRelation: f.emergencyRelation.trim(),
        emergencyPhone: f.emergencyPhone.trim(),
        vehicle: f.vehicle.trim() || undefined,
        food: f.food,
        rent,
      })
      logActivity(d, {
        kind: 'tenant',
        by: person.name,
        action: 'Updated tenant details',
        target: x.name,
        propertyId: x.propertyId,
      })
    })
    toast.success('Tenant details saved')
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title="Edit tenant"
      description={t.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save changes</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Full name" required error={tried ? errors.name : undefined}>
          <Input value={f.name} onChange={set('name')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile" required error={tried ? errors.phone : undefined}>
            <Input inputMode="tel" value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email" error={tried ? errors.email : undefined}>
            <Input type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Works or studies">
            <NativeSelect value={f.occupation} onChange={set('occupation')}>
              <option value="working">Working</option>
              <option value="student">Student</option>
            </NativeSelect>
          </Field>
          <Field label={f.occupation === 'student' ? 'College' : 'Company'}>
            <Input value={f.organisation} onChange={set('organisation')} />
          </Field>
          <Field label="Home town">
            <Input value={f.homeCity} onChange={set('homeCity')} />
          </Field>
          <Field label="Vehicle number">
            <Input value={f.vehicle} onChange={set('vehicle')} placeholder="e.g. KA 01 EK 1234" />
          </Field>
        </div>
        <p className="pt-2 text-sm font-semibold">Emergency contact</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name">
            <Input value={f.emergencyName} onChange={set('emergencyName')} />
          </Field>
          <Field label="Relation">
            <Input value={f.emergencyRelation} onChange={set('emergencyRelation')} />
          </Field>
          <Field label="Phone">
            <Input inputMode="tel" value={f.emergencyPhone} onChange={set('emergencyPhone')} />
          </Field>
        </div>
        {can('rent.view') && (
          <Field
            label="Monthly rent (₹)"
            hint="Applies from the next bill."
            error={tried ? errors.rent : undefined}
          >
            <Input inputMode="decimal" value={f.rent} onChange={set('rent')} />
          </Field>
        )}
        <div className="rounded-lg border px-3">
          <Switch
            checked={f.food}
            onChange={(v) => setF({ ...f, food: v })}
            label="Takes food at the PG"
          />
        </div>
      </div>
    </Dialog>
  )
}

/* ---------------------------------------------------------------- moved in */

function MoveInDialog({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { person } = useSession()
  const t = useTenant(tenantId)
  const db = useDb((d) => d)
  if (!t) return null
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Mark ${t.name.split(' ')[0]} as moved in?`}
      confirmLabel="Mark as moved in"
      onConfirm={() => {
        updateDb((d) => {
          const x = d.tenants.find((y) => y.id === tenantId)
          if (!x) return
          x.status = 'active'
          if (x.checkIn > TODAY) x.checkIn = TODAY
          const bed = d.beds.find((b) => b.id === x.bedId)
          if (bed) {
            bed.status = 'occupied'
            bed.tenantId = x.id
          }
          logActivity(d, {
            kind: 'tenant',
            by: person.name,
            action: `Checked in a new tenant to ${placeLabel(d, x)}`,
            target: x.name,
            propertyId: x.propertyId,
          })
        })
        toast.success(`${t.name} has moved in`)
        onClose()
      }}
    >
      <p>
        {t.name} will be shown as staying in {placeLabel(db, t)} from{' '}
        {formatDate(t.checkIn > TODAY ? TODAY : t.checkIn)}.
      </p>
    </ConfirmDialog>
  )
}
