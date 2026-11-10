/** Staff forms shared by the staff list and the staff profile. */
import { IdCard } from 'lucide-react'
import { useState } from 'react'

import { Avatar, Money } from '../../components/common'
import { Alert } from '../../components/ui-kit/feedback'
import { Button } from '../../components/ui-kit/button'
import { Checkbox, CheckboxRow } from '../../components/ui-kit/checkbox'
import { Dialog } from '../../components/ui-kit/dialog'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { LAST_MONTH, THIS_MONTH, TODAY } from '../../data/seed'
import { PAY_MODE, STAFF_ROLE } from '../../data/selectors'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { PayMode, Staff } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import {
  formatDate,
  formatMoney,
  formatMonth,
  paiseToRupeesInput,
  rupeesToPaise,
} from '../../lib/format'
import { updateExtras, useExtras } from './extras'
import { UploadTile } from './shared'
import { hueOf } from './helpers'

export function StaffDialog({ staff, onClose }: { staff?: Staff; onClose: () => void }) {
  const { person } = useSession()
  const properties = useDb((db) => db.properties)
  const [form, setForm] = useState({
    name: staff?.name ?? '',
    phone: staff?.phone ?? '',
    role: staff?.role ?? ('cleaner' as Staff['role']),
    propertyIds: staff?.propertyIds ?? ['p1'],
    shift: staff?.shift ?? '8 am – 4 pm',
    salary: staff ? paiseToRupeesInput(staff.salary) : '',
    joinedOn: staff?.joinedOn ?? TODAY,
    idProof: staff?.idProof ?? false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  function save() {
    const e: Record<string, string> = {}
    const salary = rupeesToPaise(form.salary)
    if (form.name.trim().length < 2) e.name = 'Type the person’s name.'
    if (form.phone.replace(/\D/g, '').length !== 10) e.phone = 'Type a 10-digit mobile number.'
    if (!form.propertyIds.length) e.propertyIds = 'Choose where they work.'
    if (salary === null || salary <= 0) e.salary = 'Type the monthly salary in rupees, e.g. 15000.'
    setErrors(e)
    if (Object.keys(e).length || salary === null) return
    const digits = form.phone.replace(/\D/g, '')
    const data = {
      name: form.name.trim(),
      phone: `${digits.slice(0, 5)} ${digits.slice(5)}`,
      role: form.role,
      propertyIds: form.propertyIds,
      shift: form.shift.trim() || 'Not fixed',
      salary,
      joinedOn: form.joinedOn,
      idProof: form.idProof,
    }
    updateDb((d) => {
      if (staff) {
        const x = d.staff.find((s) => s.id === staff.id)
        if (x) Object.assign(x, data)
      } else {
        d.staff.push({ id: newId('s'), ...data, status: 'active', salaryPaid: [], attendance: 0 })
      }
      logActivity(d, {
        by: person.name,
        kind: 'team',
        action: staff
          ? 'Updated staff details'
          : `Added ${STAFF_ROLE[data.role].toLowerCase()} to staff`,
        target: data.name,
        propertyId: data.propertyIds[0],
      })
    })
    toast.success(staff ? 'Staff details saved' : `${data.name} added to staff`)
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={staff ? `Edit ${staff.name}` : 'Add staff'}
      description="Cooks, cleaners, security and others who work at your PGs."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{staff ? 'Save changes' : 'Add staff'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile" required error={errors.phone}>
            <Input
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="98450 12345"
            />
          </Field>
          <Field label="Work">
            <NativeSelect
              value={form.role}
              onChange={(e) => set('role', e.target.value as Staff['role'])}
            >
              {(Object.keys(STAFF_ROLE) as Staff['role'][]).map((r) => (
                <option key={r} value={r}>
                  {STAFF_ROLE[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Works at" required error={errors.propertyIds}>
          <div className="grid gap-2 rounded-lg border p-3">
            {properties
              .filter((p) => p.status !== 'archived')
              .map((p) => (
                <CheckboxRow
                  key={p.id}
                  label={p.name}
                  checked={form.propertyIds.includes(p.id)}
                  onCheckedChange={(v) =>
                    set(
                      'propertyIds',
                      v === true
                        ? [...form.propertyIds, p.id]
                        : form.propertyIds.filter((x) => x !== p.id),
                    )
                  }
                />
              ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shift" hint="e.g. 6 am – 2 pm, or On call">
            <Input value={form.shift} onChange={(e) => set('shift', e.target.value)} />
          </Field>
          <Field label="Monthly salary (₹)" required error={errors.salary}>
            <Input
              inputMode="decimal"
              value={form.salary}
              onChange={(e) => set('salary', e.target.value)}
              placeholder="15000"
            />
          </Field>
          <Field label="Joining date">
            <Input
              type="date"
              value={form.joinedOn}
              onChange={(e) => set('joinedOn', e.target.value)}
            />
          </Field>
        </div>
        <Field label="ID proof">
          <UploadTile
            icon={<IdCard />}
            label="Add a photo of their Aadhaar, voter ID or licence"
            doneLabel="ID proof added"
            done={form.idProof}
            onClick={() => set('idProof', !form.idProof)}
          />
        </Field>
      </div>
    </Dialog>
  )
}

interface Line {
  on: boolean
  amount: string
  deduct: string
}

/** Pay salaries for a month to several people at once. */
export function PaySalariesDialog({ only, onClose }: { only?: string; onClose: () => void }) {
  const { person } = useSession()
  const allStaff = useDb((db) => db.staff)
  const advances = useExtras((x) => x.advances)
  const staff = allStaff.filter((s) => s.status !== 'left' && (!only || s.id === only))
  const unpaidIn = (m: string) => staff.filter((s) => !s.salaryPaid.some((p) => p.period === m))
  const [period, setPeriod] = useState(unpaidIn(LAST_MONTH).length ? LAST_MONTH : THIS_MONTH)
  const owed = (id: string) =>
    (advances[id] ?? []).filter((a) => !a.recovered).reduce((s, a) => s + a.amount, 0)
  const makeLines = () =>
    Object.fromEntries(
      staff.map((s) => [
        s.id,
        {
          on: true,
          amount: paiseToRupeesInput(s.salary),
          deduct: owed(s.id) ? paiseToRupeesInput(owed(s.id)) : '',
        },
      ]),
    ) as Record<string, Line>
  const [lines, setLines] = useState<Record<string, Line>>(makeLines)
  const [mode, setMode] = useState<PayMode>('bank')
  const [error, setError] = useState('')

  const due = unpaidIn(period)
  const net = (s: Staff) => {
    const l = lines[s.id]!
    return (rupeesToPaise(l.amount) ?? 0) - (rupeesToPaise(l.deduct || '0') ?? 0)
  }
  const chosen = due.filter((s) => lines[s.id]?.on)
  const total = chosen.reduce((s, x) => s + net(x), 0)
  const setLine = (id: string, patch: Partial<Line>) =>
    setLines((ls) => ({ ...ls, [id]: { ...ls[id]!, ...patch } }))

  function pay() {
    const bad = chosen.find((s) => {
      const amt = rupeesToPaise(lines[s.id]!.amount)
      return (
        amt === null || amt <= 0 || rupeesToPaise(lines[s.id]!.deduct || '0') === null || net(s) < 0
      )
    })
    if (bad) {
      setError(
        `Check the amounts for ${bad.name}: the salary must be more than the advance taken back.`,
      )
      return
    }
    if (!chosen.length) {
      setError('Tick at least one person to pay.')
      return
    }
    setError('')
    const monthName = formatMonth(period)
    updateDb((d) => {
      for (const s of chosen) {
        const x = d.staff.find((y) => y.id === s.id)
        if (!x) continue
        const amount = net(s)
        x.salaryPaid = [...x.salaryPaid, { period, paidOn: TODAY, amount }]
        d.expenses.unshift({
          id: newId('e'),
          propertyId: s.propertyIds[0] ?? 'p1',
          date: TODAY,
          category: 'salary',
          description: `${monthName} salary – ${s.name}`,
          vendor: s.name,
          amount,
          mode,
          hasBill: true,
        })
      }
      logActivity(d, {
        by: person.name,
        kind: 'expense',
        action: `Paid ${monthName} salaries of ${formatMoney(total)} to ${chosen.length} staff`,
        target: chosen.map((s) => s.name).join(', '),
      })
    })
    updateExtras((x) => {
      for (const s of chosen) {
        if ((rupeesToPaise(lines[s.id]!.deduct || '0') ?? 0) >= owed(s.id)) {
          for (const a of x.advances[s.id] ?? []) a.recovered = true
        }
      }
    })
    toast.success(`${monthName} salary paid to ${chosen.length} staff · ${formatMoney(total)}`)
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title="Pay salaries"
      description="Each payment is saved in the person’s salary history and in expenses."
      footer={
        <>
          <span className="mr-auto self-center text-sm">
            Total <Money value={total} className="font-semibold" />
          </span>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={pay} disabled={!chosen.length}>
            Pay {chosen.length} {chosen.length === 1 ? 'person' : 'people'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Salary for">
            <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)}>
              {[LAST_MONTH, THIS_MONTH].map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)} ({unpaidIn(m).length} to pay)
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Paid by">
            <NativeSelect value={mode} onChange={(e) => setMode(e.target.value as PayMode)}>
              {(Object.keys(PAY_MODE) as PayMode[]).map((m) => (
                <option key={m} value={m}>
                  {PAY_MODE[m]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {error && <Alert tone="bad">{error}</Alert>}
        {due.length === 0 && (
          <Alert tone="good" title={`Everyone is paid for ${formatMonth(period)}`}>
            Choose another month to pay.
          </Alert>
        )}
        <ul className="grid gap-3">
          {staff.map((s) => {
            const l = lines[s.id]!
            const paid = s.salaryPaid.find((p) => p.period === period)
            return (
              <li
                key={s.id}
                className={cn(
                  'rounded-lg border p-3',
                  paid && 'bg-secondary/40',
                  l.on && !paid && 'border-primary/40',
                )}
              >
                <div className="flex items-center gap-3">
                  {!paid && (
                    <Checkbox
                      aria-label={`Pay ${s.name}`}
                      checked={l.on}
                      onCheckedChange={(v) => setLine(s.id, { on: v === true })}
                    />
                  )}
                  <Avatar name={s.name} size="sm" hue={hueOf(s.name)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{STAFF_ROLE[s.role]}</p>
                  </div>
                  {paid ? (
                    <span className="text-xs text-emerald-700">
                      Paid {formatMoney(paid.amount)} on {formatDate(paid.paidOn)}
                    </span>
                  ) : (
                    <Money value={Math.max(0, net(s))} className="text-sm font-semibold" />
                  )}
                </div>
                {!paid && l.on && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Salary (₹)">
                      <Input
                        inputMode="decimal"
                        value={l.amount}
                        onChange={(e) => setLine(s.id, { amount: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="Take back advance (₹)"
                      hint={
                        owed(s.id)
                          ? `Advance taken: ${formatMoney(owed(s.id))}`
                          : 'No advance taken'
                      }
                    >
                      <Input
                        inputMode="decimal"
                        value={l.deduct}
                        placeholder="0"
                        onChange={(e) => setLine(s.id, { deduct: e.target.value })}
                      />
                    </Field>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </Dialog>
  )
}
