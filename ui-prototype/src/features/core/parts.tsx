/** Small components shared by the core business screens. */
import {
  Building2,
  IndianRupee,
  Settings as SettingsIcon,
  UserCog,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui-kit/button'
import { Dialog } from '../../components/ui-kit/dialog'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { PAY_MODE, balance } from '../../data/selectors'
import { TODAY } from '../../data/seed'
import { logActivity, newId, updateDb, useDb } from '../../data/store'
import type { Activity, PayMode } from '../../data/types'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatMoney, formatMonth, paiseToRupeesInput, rupeesToPaise } from '../../lib/format'
import { invoiceStatusAfter } from './util'

const KIND_ICON = {
  tenant: { icon: Users, box: 'bg-sky-50 text-sky-700' },
  rent: { icon: IndianRupee, box: 'bg-emerald-50 text-emerald-700' },
  property: { icon: Building2, box: 'bg-violet-50 text-violet-700' },
  complaint: { icon: Wrench, box: 'bg-amber-50 text-amber-700' },
  team: { icon: UserCog, box: 'bg-indigo-50 text-indigo-700' },
  settings: { icon: SettingsIcon, box: 'bg-slate-100 text-slate-700' },
  expense: { icon: Wallet, box: 'bg-rose-50 text-rose-700' },
} as const

export function KindIcon({ kind, className }: { kind: Activity['kind']; className?: string }) {
  const k = KIND_ICON[kind]
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full',
        k.box,
        className,
      )}
      aria-hidden
    >
      <k.icon className="size-4" />
    </span>
  )
}

/** Circular progress, e.g. "4 of 10 done". */
export function ProgressRing({
  value,
  max,
  size = 88,
}: {
  value: number
  max: number
  size?: number
}) {
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max ? value / max : 0
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value} of ${max} done`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="stroke-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums">{Math.round(pct * 100)}%</span>
      </span>
    </div>
  )
}

/** Record a payment against one rent bill (used from the dashboard task list). */
export function RecordPaymentDialog({
  invoiceId,
  onOpenChange,
}: {
  invoiceId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const invoices = useDb((db) => db.invoices)
  const tenants = useDb((db) => db.tenants)
  const invoice = invoices.find((i) => i.id === invoiceId)
  const tenant = tenants.find((t) => t.id === invoice?.tenantId)
  return (
    <Dialog
      open={!!invoice}
      onOpenChange={onOpenChange}
      variant="side"
      title="Record payment"
      description={
        tenant && invoice ? `${tenant.name} · ${formatMonth(invoice.period)} rent` : undefined
      }
    >
      {invoice && tenant && (
        <PaymentForm
          key={invoice.id}
          invoiceId={invoice.id}
          due={balance(invoice)}
          tenantName={tenant.name}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}

function PaymentForm({
  invoiceId,
  due,
  tenantName,
  onDone,
}: {
  invoiceId: string
  due: number
  tenantName: string
  onDone: () => void
}) {
  const { person } = useSession()
  const [amount, setAmount] = useState(paiseToRupeesInput(due))
  const [mode, setMode] = useState<PayMode>('upi')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(TODAY)
  const [errors, setErrors] = useState<{ amount?: string; reference?: string }>({})

  function submit(e: FormEvent) {
    e.preventDefault()
    const paise = rupeesToPaise(amount)
    const next: typeof errors = {}
    if (!paise) next.amount = 'Enter the amount received, like 9500'
    else if (paise > due)
      next.amount = `That is more than the ${formatMoney(due)} due. Enter ${paiseToRupeesInput(due)} or less.`
    if (mode === 'upi' && reference.trim().length < 6)
      next.reference = 'Enter the UPI reference (12 digits on the payment screen)'
    setErrors(next)
    if (Object.keys(next).length || !paise) return
    updateDb((db) => {
      const inv = db.invoices.find((i) => i.id === invoiceId)
      if (!inv) return
      inv.paid += paise
      inv.status = invoiceStatusAfter(inv, inv.paid)
      db.payments.unshift({
        id: newId('pay'),
        receipt: `RCPT-${String(db.payments.length + 1).padStart(5, '0')}`,
        invoiceId,
        tenantId: inv.tenantId,
        propertyId: inv.propertyId,
        amount: paise,
        mode,
        reference: reference.trim(),
        paidOn: date,
        collectedBy: person.name,
      })
      logActivity(db, {
        by: person.name,
        kind: 'rent',
        action: `Recorded a payment of ${formatMoney(paise)} by ${PAY_MODE[mode]}`,
        target: tenantName,
        propertyId: inv.propertyId,
      })
    })
    toast.success(`${formatMoney(paise)} recorded for ${tenantName}`, {
      description: 'Receipt sent on WhatsApp.',
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="rounded-lg bg-secondary px-4 py-3 text-sm">
        Still to pay: <span className="font-semibold tabular-nums">{formatMoney(due)}</span>
      </div>
      <Field label="Amount received (₹)" required error={errors.amount}>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
      <Field
        label={mode === 'cash' ? 'Note (optional)' : 'Reference number'}
        error={errors.reference}
        hint={
          mode === 'upi'
            ? 'The UPI transaction ID, so you can match it in your bank app.'
            : undefined
        }
      >
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={mode === 'cash' ? 'Paid at the office' : '4312 8890 1123'}
        />
      </Field>
      <Field label="Date received">
        <Input type="date" value={date} max={TODAY} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Record payment</Button>
      </div>
    </form>
  )
}
