import { useState } from 'react'

import { Button } from '../../components/ui-kit/button'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { Field } from '../../components/ui-kit/field'
import { Input } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { logActivity, updateDb, useDb } from '../../data/store'
import type { PayMode } from '../../data/types'
import { useSession } from '../../demo/session'
import { formatMoney, paiseToRupeesInput, rupeesToPaise } from '../../lib/format'
import { PAY_MODE_OPTIONS, TODAY, noteLine } from './lib'
import { SumRow } from './parts'

export type DepositAction = { kind: 'collect' | 'refund'; tenantId: string } | null

export function DepositDialog({ action, onClose }: { action: DepositAction; onClose: () => void }) {
  if (!action) return null
  return <DepositForm key={`${action.kind}-${action.tenantId}`} {...action} onClose={onClose} />
}

function DepositForm({
  kind,
  tenantId,
  onClose,
}: {
  kind: 'collect' | 'refund'
  tenantId: string
  onClose: () => void
}) {
  const { person } = useSession()
  const t = useDb((db) => db.tenants.find((x) => x.id === tenantId))
  const pending = t ? Math.max(0, t.deposit - t.depositPaid) : 0
  const refund = kind === 'refund'
  const [amountText, setAmountText] = useState(
    paiseToRupeesInput(refund ? (t?.depositPaid ?? 0) : pending),
  )
  const [deductText, setDeductText] = useState('')
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState<PayMode>('upi')
  const [reference, setReference] = useState('')
  const [on, setOn] = useState(TODAY)
  const [tried, setTried] = useState(false)
  if (!t) return null
  const amount = rupeesToPaise(amountText)
  const deduct = deductText ? rupeesToPaise(deductText) : 0
  const limit = refund ? t.depositPaid : pending
  const errors = {
    amount:
      amount === null || (amount <= 0 && !(refund && (deduct ?? 0) > 0))
        ? 'Type an amount in rupees, for example 9500.'
        : amount + (deduct ?? 0) > limit
          ? refund
            ? `Refund plus deductions can’t be more than the ${formatMoney(limit)} held.`
            : `Only ${formatMoney(limit)} of the deposit is still to pay.`
          : undefined,
    deduct: deduct === null ? 'Type the deduction in rupees, or leave it empty.' : undefined,
    reason:
      refund && (deduct ?? 0) > 0 && !reason.trim()
        ? 'Say why you are keeping this amount, e.g. broken chair.'
        : undefined,
    reference:
      mode !== 'cash' && !reference.trim() && (amount ?? 0) > 0
        ? 'Type the UPI or bank reference (UTR).'
        : undefined,
  }

  function save() {
    setTried(true)
    if (Object.values(errors).some(Boolean) || amount === null || !t) return
    const name = t.name
    updateDb((d) => {
      const x = d.tenants.find((y) => y.id === tenantId)
      if (!x) return
      const modeLabel = PAY_MODE_OPTIONS.find((m) => m.value === mode)?.label
      if (refund) {
        x.depositPaid -= amount + (deduct ?? 0)
        const text = `Refunded deposit of ${formatMoney(amount)} by ${modeLabel}${deduct ? `, kept ${formatMoney(deduct)} for ${reason.trim()}` : ''}`
        x.notes = [x.notes, noteLine(person.name, `${text}.`)].filter(Boolean).join('\n')
        logActivity(d, {
          kind: 'rent',
          by: person.name,
          action: text,
          target: x.name,
          propertyId: x.propertyId,
        })
      } else {
        x.depositPaid += amount
        const text = `Received deposit of ${formatMoney(amount)} by ${modeLabel}`
        x.notes = [
          x.notes,
          noteLine(person.name, `${text}${reference ? ` (${reference.trim()})` : ''}.`),
        ]
          .filter(Boolean)
          .join('\n')
        logActivity(d, {
          kind: 'rent',
          by: person.name,
          action: text,
          target: x.name,
          propertyId: x.propertyId,
        })
      }
    })
    toast.success(
      refund
        ? `Deposit refund of ${formatMoney(amount)} recorded for ${name}`
        : `Deposit of ${formatMoney(amount)} received from ${name}`,
    )
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={refund ? 'Refund deposit' : 'Record deposit payment'}
      description={t.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{refund ? 'Save refund' : 'Save payment'}</Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="rounded-lg border bg-secondary/40 p-3">
          <SumRow label="Agreed deposit" value={formatMoney(t.deposit)} />
          <SumRow label="Held now" value={formatMoney(t.depositPaid)} />
          <SumRow label="Still to pay" value={formatMoney(pending)} strong />
        </div>
        <Field
          label={refund ? 'Amount refunded (₹)' : 'Amount received (₹)'}
          required
          error={tried ? errors.amount : undefined}
        >
          <Input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className="text-base font-semibold"
          />
        </Field>
        {refund && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Kept for damages (₹)"
              hint="Optional"
              error={tried ? errors.deduct : undefined}
            >
              <Input
                inputMode="decimal"
                value={deductText}
                onChange={(e) => setDeductText(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Reason" error={tried ? errors.reason : undefined}>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Broken chair"
              />
            </Field>
          </div>
        )}
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium">{refund ? 'Refunded by' : 'Paid by'}</span>
          <div>
            <Segmented label="Mode" value={mode} onChange={setMode} options={PAY_MODE_OPTIONS} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Reference / UTR"
            required={mode !== 'cash'}
            error={tried ? errors.reference : undefined}
          >
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={on} max={TODAY} onChange={(e) => setOn(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  )
}
