import {
  BadgePercent,
  ChevronLeft,
  Download,
  IndianRupee,
  MessageCircle,
  MoreHorizontal,
  Plus,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { Money, Status } from '../../components/common'
import { Button } from '../../components/ui-kit/button'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Alert, EmptyState } from '../../components/ui-kit/feedback'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui-kit/menu'
import { toast } from '../../components/ui-kit/toast'
import { INVOICE_STATUS, PAY_MODE, balance, daysLate, placeLabel } from '../../data/selectors'
import { logActivity, updateDb, useDb } from '../../data/store'
import { useSession } from '../../demo/session'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney, formatMonth } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { NoAccessGuard } from './guards'
import { daysInMonth, waLink } from './lib'
import { AddChargeDialog, ReceiptDialog, RecordPaymentDialog } from './money-dialogs'
import { FakeQr, PrintOnly } from './parts'

export function InvoiceDetail() {
  return (
    <NoAccessGuard perm="rent.view" what="rent bills">
      <Bill />
    </NoAccessGuard>
  )
}

function Bill() {
  const { invoiceId = '' } = useParams()
  const { can, person } = useSession()
  const navigate = useNavigate()
  const db = useDb((d) => d)
  const inv = db.invoices.find((i) => i.id === invoiceId)
  useBreadcrumbs([
    { label: 'Rent & bills', to: '/app/rent' },
    { label: inv?.number ?? 'Bill not found' },
  ])
  const [dialog, setDialog] = useState<'pay' | 'charge' | 'discount' | 'cancel' | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)

  if (!inv)
    return (
      <EmptyState
        title="This bill isn’t here"
        actions={
          <Button asChild>
            <Link to="/app/rent">Back to rent</Link>
          </Button>
        }
      >
        It may have been cancelled.
      </EmptyState>
    )

  const t = db.tenants.find((x) => x.id === inv.tenantId)
  const property = db.properties.find((p) => p.id === inv.propertyId)
  const pays = db.payments
    .filter((p) => p.invoiceId === inv.id)
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn))
  const due = balance(inv)
  const late = daysLate(inv)
  const { business, settings } = db
  const upiLink = `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(business.name)}&am=${(due / 100).toFixed(2)}&tn=${inv.number}`
  const msg = `Hi ${t?.name.split(' ')[0] ?? ''}, your ${formatMonth(inv.period)} bill ${inv.number} is ${formatMoney(inv.total)}.${due > 0 ? ` Balance due: ${formatMoney(due)} by ${formatDate(inv.dueOn)}. Pay by UPI to ${settings.upiId}.` : ' It is fully paid. Thank you!'}\n– ${business.name}`
  const lastDay = `${inv.period}-${String(daysInMonth(inv.period)).padStart(2, '0')}`

  function cancel() {
    if (!inv) return
    updateDb((d) => {
      d.invoices = d.invoices.filter((i) => i.id !== inv.id)
      logActivity(d, {
        kind: 'rent',
        by: person.name,
        action: `Cancelled bill ${inv.number}`,
        target: t?.name ?? inv.number,
        propertyId: inv.propertyId,
      })
    })
    toast.success(`Bill ${inv.number} cancelled`)
    navigate('/app/rent')
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PrintOnly id="invoice-print" />
      <Link
        to="/app/rent"
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Rent & bills
      </Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{inv.number}</h1>
          <Status of={INVOICE_STATUS} value={inv.status} />
          {late > 0 && <span className="text-sm font-medium text-red-700">{late} days late</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {can('rent.collect') && due > 0 && (
            <Button onClick={() => setDialog('pay')}>
              <IndianRupee /> Record payment
            </Button>
          )}
          {t && (
            <Button variant="outline" asChild>
              <a href={waLink(t.phone, msg)} target="_blank" rel="noreferrer">
                <MessageCircle /> Send on WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Download /> Download PDF
          </Button>
          {(can('rent.collect') || can('rent.adjust')) && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                {can('rent.collect') && (
                  <MenuItem icon={<Plus />} onSelect={() => setDialog('charge')}>
                    Add charge
                  </MenuItem>
                )}
                {can('rent.adjust') && due > 0 && (
                  <MenuItem icon={<BadgePercent />} onSelect={() => setDialog('discount')}>
                    Give discount
                  </MenuItem>
                )}
                {can('rent.adjust') && (
                  <MenuItem icon={<XCircle />} destructive onSelect={() => setDialog('cancel')}>
                    Cancel bill
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>

      <div id="invoice-print" className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-secondary/40 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {business.logoText}
            </span>
            <div>
              <p className="text-base font-semibold">{business.name}</p>
              <p className="text-xs text-muted-foreground">
                {property?.name} · {property?.locality}, {property?.city}
              </p>
              <p className="text-xs text-muted-foreground">GSTIN {business.gstin}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              Rent bill
            </p>
            <p className="text-lg font-semibold">{inv.number}</p>
          </div>
        </div>

        <div className="grid gap-5 border-b px-6 py-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Billed to</p>
            {t ? (
              <Link to={`/app/tenants/${t.id}`} className="text-sm font-semibold hover:underline">
                {t.name}
              </Link>
            ) : (
              <p className="text-sm font-semibold">—</p>
            )}
            <p className="text-xs text-muted-foreground">{placeLabel(db, t)}</p>
            <p className="text-xs text-muted-foreground">{t?.phone}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Period</p>
            <p className="text-sm font-semibold">{formatMonth(inv.period)}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(`${inv.period}-01`)} – {formatDate(lastDay)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Issued · Due</p>
            <p className="text-sm font-semibold">
              {formatDate(inv.issuedOn)} ·{' '}
              <span className={cn(late > 0 && 'text-red-700')}>{formatDate(inv.dueOn)}</span>
            </p>
          </div>
        </div>

        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, idx) => (
                <tr key={idx} className="border-b border-dashed last:border-0">
                  <td className="py-2.5">{l.label}</td>
                  <td
                    className={cn(
                      'py-2.5 text-right tabular-nums',
                      l.amount < 0 && 'text-emerald-700',
                    )}
                  >
                    {l.amount < 0 ? `− ${formatMoney(-l.amount)}` : formatMoney(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 border-t px-6 py-5 sm:grid-cols-[1fr_auto]">
          <div className="flex items-start gap-4">
            {due > 0 ? (
              <>
                <a href={upiLink} aria-label="Pay by UPI" className="shrink-0">
                  <FakeQr text={upiLink} size={112} />
                </a>
                <div className="text-sm">
                  <p className="font-semibold">Scan to pay by UPI</p>
                  <p className="text-muted-foreground">Google Pay, PhonePe, Paytm or any UPI app</p>
                  <p className="mt-2 font-mono text-[13px]">{settings.upiId}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Write {inv.number} in the note.
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-lg border-2 border-emerald-600 px-4 py-2 text-center text-emerald-700 sm:-rotate-3">
                <p className="text-lg font-bold tracking-widest uppercase">Paid</p>
                <p className="text-xs">in full · thank you</p>
              </div>
            )}
          </div>
          <div className="min-w-56 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Total</span>
              <Money value={inv.total} />
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Paid</span>
              <Money value={inv.paid} className="text-emerald-700" />
            </div>
            <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Balance due</span>
              <Money value={due} className={due > 0 ? 'text-red-700' : undefined} />
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-4">
          <p className="mb-2 text-sm font-semibold">Payments</p>
          {pays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {pays.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setReceiptId(p.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left hover:bg-secondary/40"
                  >
                    <span>
                      <span className="font-medium text-primary">{p.receipt}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {formatDate(p.paidOn)} · {PAY_MODE[p.mode]}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </span>
                    </span>
                    <Money value={p.amount} className="font-medium" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="border-t bg-secondary/40 px-6 py-3 text-center text-xs text-muted-foreground">
          {settings.receiptFooter} Late fee of {formatMoney(settings.lateFeePerDay)} a day after{' '}
          {settings.lateFeeAfterDays} days.
        </p>
      </div>

      {inv.status === 'overdue' && can('rent.collect') && (
        <Alert tone="bad" className="mt-5" title={`${late} days late`}>
          A late fee of {formatMoney(settings.lateFeePerDay)} a day applies after{' '}
          {settings.lateFeeAfterDays} days. You can add it when you record the payment.
        </Alert>
      )}

      {dialog === 'pay' && (
        <RecordPaymentDialog invoiceId={inv.id} onClose={() => setDialog(null)} />
      )}
      {(dialog === 'charge' || dialog === 'discount') && (
        <AddChargeDialog invoiceId={inv.id} mode={dialog} onClose={() => setDialog(null)} />
      )}
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Cancel bill ${inv.number}?`}
        confirmLabel="Cancel bill"
        destructive
        onConfirm={() => {
          if (inv.paid > 0) {
            toast.error('This bill has payments. Give a discount instead of cancelling it.')
            setDialog(null)
            return
          }
          cancel()
        }}
      >
        {inv.paid > 0 ? (
          <p>
            {formatMoney(inv.paid)} has already been paid on this bill, so it can’t be cancelled.
            Give a discount to reduce the balance instead.
          </p>
        ) : (
          <p>
            The bill for {formatMoney(inv.total)} will be removed and {t?.name ?? 'the tenant'} will
            no longer owe it. This can’t be undone.
          </p>
        )}
      </ConfirmDialog>
      {receiptId && <ReceiptDialog paymentId={receiptId} onClose={() => setReceiptId(null)} />}
    </div>
  )
}
