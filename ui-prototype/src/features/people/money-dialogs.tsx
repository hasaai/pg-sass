/** Dialogs for money: record a payment, show a receipt, send reminders, add a charge or discount. */
import { MessageCircle, Printer } from 'lucide-react'
import { useState } from 'react'

import { Money, Status, Switch } from '../../components/common'
import { Alert } from '../../components/ui-kit/feedback'
import { Button } from '../../components/ui-kit/button'
import { Segmented } from '../../components/ui-kit/choice-cards'
import { Dialog } from '../../components/ui-kit/dialog'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { toast } from '../../components/ui-kit/toast'
import { INVOICE_STATUS, PAY_MODE, balance, placeLabel } from '../../data/selectors'
import { logActivity, updateDb, useDb } from '../../data/store'
import type { PayMode, Reminder } from '../../data/types'
import { useSession } from '../../demo/session'
import {
  formatDate,
  formatMoney,
  formatMonth,
  paiseToRupeesInput,
  rupeesToPaise,
} from '../../lib/format'
import {
  CHANNEL_WORD,
  PAY_MODE_OPTIONS,
  TODAY,
  daysBetween,
  lateFeeFor,
  reminderText,
  recordPayment,
  sendReminders,
  statusFor,
  waLink,
} from './lib'
import { PrintOnly, SumRow } from './parts'

/* ---------------------------------------------------------------- record payment */

export function RecordPaymentDialog({
  invoiceId,
  tenantId,
  onClose,
}: {
  invoiceId?: string
  tenantId?: string
  onClose: () => void
}) {
  const { person, can } = useSession()
  const invoices = useDb((db) => db.invoices)
  const tenants = useDb((db) => db.tenants)
  const settings = useDb((db) => db.settings)
  const unpaid = invoices
    .filter(
      (i) => (invoiceId ? i.id === invoiceId : i.tenantId === tenantId) && i.status !== 'paid',
    )
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
  const [billId, setBillId] = useState(invoiceId ?? unpaid[0]?.id ?? '')
  const inv = invoices.find((i) => i.id === billId)
  const tenant = tenants.find((t) => t.id === (inv?.tenantId ?? tenantId))
  const late = inv ? lateFeeFor(settings, inv) : { days: 0, amount: 0 }

  const [amountText, setAmountText] = useState<string | null>(null)
  const [mode, setMode] = useState<PayMode>('upi')
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState(TODAY)
  const [note, setNote] = useState('')
  const [addLate, setAddLate] = useState(false)
  const [discountText, setDiscountText] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  const discount = discountText ? rupeesToPaise(discountText) : 0
  const newBalance = inv ? balance(inv) + (addLate ? late.amount : 0) - (discount ?? 0) : 0
  const shownAmount = amountText ?? paiseToRupeesInput(Math.max(0, newBalance))
  const amount = rupeesToPaise(shownAmount)

  const errors = {
    bill: !inv ? 'Choose the bill this payment is for.' : undefined,
    amount:
      amount === null || amount <= 0
        ? 'Type the amount received, for example 9500.'
        : amount > newBalance
          ? `This is more than the balance of ${formatMoney(newBalance)}. Type ${formatMoney(newBalance)} or less.`
          : undefined,
    reference:
      mode !== 'cash' && !reference.trim()
        ? 'Type the UPI or bank reference (UTR) so you can match it later.'
        : undefined,
    discount:
      discount === null
        ? 'Type the discount in rupees, for example 500.'
        : inv && discount > balance(inv)
          ? 'The discount can’t be more than the balance.'
          : undefined,
    paidOn: !paidOn
      ? 'Choose the date the money was received.'
      : paidOn > TODAY
        ? 'The date can’t be in the future.'
        : undefined,
  }
  const hasError = Object.values(errors).some(Boolean)

  function save() {
    setTried(true)
    if (hasError || !inv || amount === null) return
    setBusy(true)
    const receipt = recordPayment({
      invoiceId: inv.id,
      amount,
      mode,
      reference: reference || (mode === 'cash' ? 'Cash at office' : ''),
      paidOn,
      note: note.trim() || undefined,
      lateFee: addLate ? late.amount : 0,
      discount: discount ?? 0,
      by: person.name,
    })
    const left = newBalance - amount
    const msg = `Hi ${tenant?.name.split(' ')[0] ?? ''}, we received ${formatMoney(amount)} for ${formatMonth(inv.period)} rent. Receipt ${receipt}.${left > 0 ? ` Balance due: ${formatMoney(left)}.` : ' Your bill is fully paid. Thank you!'}`
    toast.success(`Payment saved · Receipt ${receipt}`, {
      description:
        left > 0
          ? `${formatMoney(left)} still to pay on this bill.`
          : 'The bill is now fully paid.',
      action: tenant
        ? {
            label: 'Share on WhatsApp',
            onClick: () => window.open(waLink(tenant.phone, msg), '_blank'),
          }
        : undefined,
      duration: 8000,
    })
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title="Record payment"
      description={tenant ? `${tenant.name} · ${tenant.phone}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} busy={busy} disabled={!inv}>
            Save payment
          </Button>
        </>
      }
    >
      {unpaid.length === 0 && !inv ? (
        <Alert tone="good" title="Nothing to collect">
          {tenant?.name ?? 'This tenant'} has no unpaid bills right now.
        </Alert>
      ) : (
        <div className="grid gap-5">
          {!invoiceId && unpaid.length > 1 && (
            <Field label="Bill" error={tried ? errors.bill : undefined}>
              <NativeSelect
                value={billId}
                onChange={(e) => {
                  setBillId(e.target.value)
                  setAmountText(null)
                  setAddLate(false)
                }}
              >
                {unpaid.map((i) => (
                  <option key={i.id} value={i.id}>
                    {formatMonth(i.period)} · {i.number} · {formatMoney(balance(i))} due
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {inv && (
            <div className="rounded-lg border bg-secondary/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {formatMonth(inv.period)} bill · {inv.number}
                </p>
                <Status of={INVOICE_STATUS} value={inv.status} />
              </div>
              <div className="mt-2">
                <SumRow label="Bill total" value={formatMoney(inv.total)} />
                <SumRow label="Already paid" value={formatMoney(inv.paid)} />
                {addLate && late.amount > 0 && (
                  <SumRow label="Late fee" value={`+ ${formatMoney(late.amount)}`} />
                )}
                {!!discount && (
                  <SumRow label="Discount" value={`− ${formatMoney(discount)}`} tone="good" />
                )}
                <SumRow
                  label="Balance to collect"
                  value={formatMoney(Math.max(0, newBalance))}
                  strong
                />
              </div>
            </div>
          )}
          <Field
            label="Amount received (₹)"
            required
            hint="Prefilled with the full balance. You can take part of it."
            error={tried ? errors.amount : undefined}
          >
            <Input
              inputMode="decimal"
              value={shownAmount}
              onChange={(e) => setAmountText(e.target.value)}
              className="text-base font-semibold tabular-nums"
            />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium">Paid by</span>
            <div>
              <Segmented
                label="Paid by"
                value={mode}
                onChange={setMode}
                options={PAY_MODE_OPTIONS}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={mode === 'cash' ? 'Reference (optional)' : 'Reference / UTR'}
              required={mode !== 'cash'}
              error={tried ? errors.reference : undefined}
            >
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={
                  mode === 'upi'
                    ? 'e.g. 431298765012'
                    : mode === 'cash'
                      ? 'e.g. Paid at office'
                      : 'e.g. UTR number'
                }
              />
            </Field>
            <Field label="Date received" required error={tried ? errors.paidOn : undefined}>
              <Input
                type="date"
                value={paidOn}
                max={TODAY}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </Field>
          </div>
          {late.amount > 0 && (
            <div className="rounded-lg border px-3">
              <Switch
                checked={addLate}
                onChange={(v) => {
                  setAddLate(v)
                  setAmountText(null)
                }}
                label={`Add late fee ${formatMoney(late.amount)}`}
                description={`${late.days} ${late.days === 1 ? 'day' : 'days'} late after the ${settings.lateFeeAfterDays}-day grace period, at ${formatMoney(settings.lateFeePerDay)} a day.`}
              />
            </div>
          )}
          {can('rent.adjust') && (
            <Field
              label="Discount (₹)"
              hint="Optional. Shown on the bill as a discount."
              error={tried ? errors.discount : undefined}
            >
              <Input
                inputMode="decimal"
                value={discountText}
                onChange={(e) => {
                  setDiscountText(e.target.value)
                  setAmountText(null)
                }}
                placeholder="0"
              />
            </Field>
          )}
          <Field label="Note (optional)">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid by her father"
            />
          </Field>
        </div>
      )}
    </Dialog>
  )
}

/* ---------------------------------------------------------------- receipt */

export function ReceiptDialog({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const payment = useDb((db) => db.payments.find((p) => p.id === paymentId))
  const tenants = useDb((db) => db.tenants)
  const invoices = useDb((db) => db.invoices)
  const properties = useDb((db) => db.properties)
  const business = useDb((db) => db.business)
  const settings = useDb((db) => db.settings)
  const db = useDb((d) => d)
  if (!payment) return null
  const tenant = tenants.find((t) => t.id === payment.tenantId)
  const inv = invoices.find((i) => i.id === payment.invoiceId)
  const property = properties.find((p) => p.id === payment.propertyId)
  const msg = `Receipt ${payment.receipt} from ${business.name}: ${formatMoney(payment.amount)} received on ${formatDate(payment.paidOn)} by ${PAY_MODE[payment.mode]}${inv ? ` for ${formatMonth(inv.period)} rent` : ''}. ${settings.receiptFooter}`
  const place = tenant ? placeLabel(db, tenant) : '—'

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Receipt ${payment.receipt}`}
      footer={
        <>
          {tenant && (
            <Button variant="outline" asChild>
              <a href={waLink(tenant.phone, msg)} target="_blank" rel="noreferrer">
                <MessageCircle /> Share on WhatsApp
              </a>
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </>
      }
    >
      <PrintOnly id="receipt-print" />
      <div id="receipt-print" className="rounded-lg border p-5">
        <div className="flex items-start justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-base font-semibold">{business.name}</p>
            <p className="text-xs text-muted-foreground">{property?.name}</p>
            <p className="text-xs text-muted-foreground">GSTIN {business.gstin}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Payment receipt
            </p>
            <p className="text-sm font-semibold">{payment.receipt}</p>
            <p className="text-xs text-muted-foreground">{formatDate(payment.paidOn)}</p>
          </div>
        </div>
        <div className="py-4 text-center">
          <p className="text-xs text-muted-foreground">Amount received</p>
          <Money value={payment.amount} className="text-3xl font-semibold tracking-tight" />
        </div>
        <div className="grid gap-0.5 border-t pt-3">
          <SumRow label="Received from" value={tenant?.name ?? '—'} />
          <SumRow label="Place" value={place} />
          {inv && <SumRow label="For" value={`${formatMonth(inv.period)} · ${inv.number}`} />}
          <SumRow label="Paid by" value={PAY_MODE[payment.mode]} />
          {payment.reference && <SumRow label="Reference" value={payment.reference} />}
          <SumRow label="Collected by" value={payment.collectedBy} />
          {inv && (
            <SumRow label="Balance left on this bill" value={formatMoney(balance(inv))} strong />
          )}
        </div>
        <p className="mt-4 border-t pt-3 text-center text-xs text-muted-foreground">
          {settings.receiptFooter}
        </p>
      </div>
    </Dialog>
  )
}

/* ---------------------------------------------------------------- reminders */

export function ReminderPreview({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-[#e5ddd5] p-3">
      <div className="ml-auto max-w-[90%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line text-slate-900 shadow-sm">
        {text}
        <span className="mt-1 block text-right text-[10px] text-slate-500">10:00 am ✓✓</span>
      </div>
    </div>
  )
}

/** Confirm sending reminders for a set of bills, with channel choice. */
export function SendRemindersDialog({
  invoiceIds,
  onClose,
  title = 'Send rent reminders',
}: {
  invoiceIds: string[]
  onClose: () => void
  title?: string
}) {
  const { person } = useSession()
  const invoices = useDb((db) => db.invoices)
  const tenants = useDb((db) => db.tenants)
  const settings = useDb((db) => db.settings)
  const business = useDb((db) => db.business)
  const [channel, setChannel] = useState<Reminder['channel']>('whatsapp')
  const list = invoices.filter((i) => invoiceIds.includes(i.id) && i.status !== 'paid')
  const sample = list[0]
  const sampleTenant = tenants.find((t) => t.id === sample?.tenantId)
  const total = list.reduce((s, i) => s + balance(i), 0)

  function send() {
    const n = sendReminders(
      list.map((i) => i.id),
      channel,
      person.name,
    )
    toast.success(
      `Reminders sent to ${n} ${n === 1 ? 'tenant' : 'tenants'} on ${CHANNEL_WORD[channel]}`,
    )
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!list.length}>
            Send to {list.length} {list.length === 1 ? 'tenant' : 'tenants'}
          </Button>
        </>
      }
    >
      {list.length === 0 ? (
        <Alert tone="good" title="Everyone has paid">
          None of the chosen tenants has an unpaid bill, so there is nothing to remind.
        </Alert>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            {list.length} {list.length === 1 ? 'tenant owes' : 'tenants owe'} a total of{' '}
            <span className="font-semibold text-foreground">{formatMoney(total)}</span>.
          </p>
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium">Send by</span>
            <div>
              <Segmented
                label="Send by"
                value={channel}
                onChange={setChannel}
                options={[
                  { value: 'whatsapp', label: 'WhatsApp' },
                  { value: 'sms', label: 'SMS' },
                  { value: 'email', label: 'Email' },
                ]}
              />
            </div>
          </div>
          {sample && sampleTenant && (
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium">
                Message (example for {sampleTenant.name})
              </span>
              <ReminderPreview
                text={reminderText({
                  name: sampleTenant.name,
                  amount: balance(sample),
                  period: sample.period,
                  dueOn: sample.dueOn,
                  upiId: settings.upiId,
                  business: business.name,
                  lateDays: sample.dueOn < TODAY ? daysBetween(sample.dueOn, TODAY) : 0,
                })}
              />
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

/* ---------------------------------------------------------------- bill changes */

const CHARGE_KINDS = [
  'Electricity (meter share)',
  'Damage',
  'Laundry',
  'Extra food / guest meals',
  'Key replacement',
  'Other',
]

export function AddChargeDialog({
  invoiceId,
  mode,
  onClose,
}: {
  invoiceId: string
  mode: 'charge' | 'discount'
  onClose: () => void
}) {
  const { person } = useSession()
  const inv = useDb((db) => db.invoices.find((i) => i.id === invoiceId))
  const tenants = useDb((db) => db.tenants)
  const [kind, setKind] = useState(CHARGE_KINDS[0]!)
  const [label, setLabel] = useState('')
  const [amountText, setAmountText] = useState('')
  const [tried, setTried] = useState(false)
  if (!inv) return null
  const amount = rupeesToPaise(amountText)
  const isCharge = mode === 'charge'
  const finalLabel = isCharge
    ? kind === 'Other'
      ? label.trim()
      : kind
    : label.trim() || 'Discount'
  const errors = {
    amount:
      amount === null || amount <= 0
        ? 'Type an amount in rupees, for example 450.'
        : !isCharge && amount > balance(inv)
          ? `The discount can’t be more than the balance of ${formatMoney(balance(inv))}.`
          : undefined,
    label:
      isCharge && kind === 'Other' && !label.trim() ? 'Say what this charge is for.' : undefined,
  }
  const tenant = tenants.find((t) => t.id === inv.tenantId)

  function save() {
    setTried(true)
    if (errors.amount || errors.label || amount === null) return
    updateDb((d) => {
      const i = d.invoices.find((x) => x.id === invoiceId)
      if (!i) return
      i.lines = [...i.lines, { label: finalLabel, amount: isCharge ? amount : -amount }]
      i.total = i.lines.reduce((s, l) => s + l.amount, 0)
      i.status = statusFor(i)
      logActivity(d, {
        kind: 'rent',
        by: person.name,
        action: isCharge
          ? `Added ${finalLabel.toLowerCase()} of ${formatMoney(amount)} to ${i.number}`
          : `Gave a discount of ${formatMoney(amount)} on ${i.number}`,
        target: tenant?.name ?? i.number,
        propertyId: i.propertyId,
      })
    })
    toast.success(
      isCharge
        ? `${finalLabel} of ${formatMoney(amount)} added to the bill`
        : `Discount of ${formatMoney(amount)} given`,
    )
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      variant="side"
      title={isCharge ? 'Add a charge' : 'Give a discount'}
      description={`${inv.number} · ${tenant?.name ?? ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{isCharge ? 'Add to bill' : 'Give discount'}</Button>
        </>
      }
    >
      <div className="grid gap-5">
        {isCharge ? (
          <Field label="What is it for?" required>
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)}>
              {CHARGE_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        {(!isCharge || kind === 'Other') && (
          <Field
            label={isCharge ? 'Describe the charge' : 'Reason (shown on the bill)'}
            required={isCharge}
            error={tried ? errors.label : undefined}
          >
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={isCharge ? 'e.g. Broken window glass' : 'e.g. Wi-Fi was down for a week'}
            />
          </Field>
        )}
        <Field label="Amount (₹)" required error={tried ? errors.amount : undefined}>
          <Input
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0"
          />
        </Field>
        <div className="rounded-lg border bg-secondary/40 p-3">
          <SumRow label="Bill total now" value={formatMoney(inv.total)} />
          <SumRow
            label={isCharge ? 'After this charge' : 'After the discount'}
            value={formatMoney(inv.total + (amount ?? 0) * (isCharge ? 1 : -1))}
            strong
          />
        </div>
      </div>
    </Dialog>
  )
}
