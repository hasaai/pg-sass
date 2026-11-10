/** Business settings: profile, rent rules, payments, reminders, receipts, notifications, your profile. */
import { KeyRound, LogOut, QrCode, Save } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { LineTabs, Section, Switch } from '../../components/common'
import { Badge } from '../../components/ui-kit/badge'
import { Button } from '../../components/ui-kit/button'
import { CheckboxRow } from '../../components/ui-kit/checkbox'
import { ConfirmDialog } from '../../components/ui-kit/confirm'
import { Dialog } from '../../components/ui-kit/dialog'
import { PageHeader } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input, NativeSelect, Textarea } from '../../components/ui-kit/input'
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { TODAY } from '../../data/seed'
import { logActivity, updateDb, useDb } from '../../data/store'
import { useSession } from '../../demo/session'
import { formatDate, formatMoney, paiseToRupeesInput, rupeesToPaise } from '../../lib/format'
import { useBreadcrumbs } from '../../shell/crumbs'
import { onboardingStore } from './util'

type Tab = 'business' | 'rent' | 'payments' | 'reminders' | 'receipts' | 'notifications' | 'profile'

const TABS: { value: Tab; label: string; ownerish: boolean }[] = [
  { value: 'business', label: 'Business profile', ownerish: true },
  { value: 'rent', label: 'Rent & bills', ownerish: true },
  { value: 'payments', label: 'Payments', ownerish: true },
  { value: 'reminders', label: 'Reminders', ownerish: true },
  { value: 'receipts', label: 'Receipts', ownerish: true },
  { value: 'notifications', label: 'Notifications', ownerish: false },
  { value: 'profile', label: 'Your profile', ownerish: false },
]

function SaveBar({ onSave, children }: { onSave: () => void; children?: ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      {children}
      <Button onClick={onSave}>
        <Save /> Save changes
      </Button>
    </div>
  )
}

export function SettingsPage() {
  const { can } = useSession()
  const [params, setParams] = useSearchParams()
  const tabs = TABS.filter((t) => !t.ownerish || can('business.settings'))
  const requested = params.get('tab') as Tab | null
  const tab: Tab = tabs.some((t) => t.value === requested) ? requested! : tabs[0]!.value
  const label = tabs.find((t) => t.value === tab)!.label
  useBreadcrumbs([{ label: 'Settings', to: '/app/settings' }, { label }])

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Settings"
        description="How your business, bills, reminders and receipts work."
      />
      <LineTabs
        tabs={tabs}
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
      />
      {tab === 'business' && <BusinessTab />}
      {tab === 'rent' && <RentTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'reminders' && <RemindersTab />}
      {tab === 'receipts' && <ReceiptsTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'profile' && <ProfileTab />}
    </div>
  )
}

/* ------------------------------------------------------------------ business profile */

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

function BusinessTab() {
  const business = useDb((db) => db.business)
  const { person } = useSession()
  const [f, setF] = useState({
    name: business.name,
    logoText: business.logoText,
    gstin: business.gstin,
    address: business.address,
    city: business.city,
    phone: business.phone,
    email: business.email,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }))

  function save() {
    const next: Record<string, string> = {}
    if (f.name.trim().length < 2) next.name = 'Enter your business name'
    if (f.gstin && !GSTIN_RE.test(f.gstin.trim().toUpperCase()))
      next.gstin =
        'GSTIN has 15 characters, like 29ABCDE1234F1Z5. Leave empty if you don’t have one.'
    if (!/^[6-9]\d{4} ?\d{5}$/.test(f.phone.trim()))
      next.phone = 'Enter a 10-digit mobile number, like 98450 12345'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()))
      next.email = 'Enter an email like name@example.com'
    setErrors(next)
    if (Object.keys(next).length) return
    updateDb((db) => {
      const emailChanged = db.business.email !== f.email.trim()
      Object.assign(db.business, {
        ...f,
        gstin: f.gstin.trim().toUpperCase(),
        logoText: (f.logoText.trim() || f.name.slice(0, 2)).toUpperCase().slice(0, 2),
      })
      if (emailChanged) db.business.emailConfirmed = false
      logActivity(db, {
        by: person.name,
        kind: 'settings',
        action: 'Changed the business profile',
        target: f.name,
      })
    })
    toast.success('Business profile saved')
  }

  return (
    <Section title="Business profile" description="Shown on rent bills, receipts and your listing.">
      <div className="mb-5 flex items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-xl bg-primary text-xl font-semibold text-primary-foreground">
          {(f.logoText || f.name.slice(0, 2)).toUpperCase().slice(0, 2)}
        </span>
        <div className="grid gap-1.5">
          <Field label="Logo letters" hint="Up to 2 letters. Upload a logo later.">
            <Input
              className="w-24 uppercase"
              maxLength={2}
              value={f.logoText}
              onChange={set('logoText')}
            />
          </Field>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" required error={errors.name}>
          <Input value={f.name} onChange={set('name')} />
        </Field>
        <Field
          label="GSTIN"
          error={errors.gstin}
          hint="Optional. Shown on receipts if you turn it on."
        >
          <Input
            className="uppercase"
            value={f.gstin}
            onChange={set('gstin')}
            placeholder="29ABCDE1234F1Z5"
          />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea rows={2} value={f.address} onChange={set('address')} />
        </Field>
        <Field label="City">
          <Input value={f.city} onChange={set('city')} />
        </Field>
        <Field label="Phone" required error={errors.phone}>
          <Input type="tel" value={f.phone} onChange={set('phone')} />
        </Field>
        <Field
          label="Email"
          required
          error={errors.email}
          hint={
            business.emailConfirmed
              ? 'Confirmed'
              : 'Not confirmed yet – check your inbox for the link.'
          }
        >
          <Input type="email" value={f.email} onChange={set('email')} />
        </Field>
      </div>
      <SaveBar onSave={save} />
    </Section>
  )
}

/* ------------------------------------------------------------------ rent & bills */

function RentTab() {
  const settings = useDb((db) => db.settings)
  const properties = useDb((db) => db.properties)
  const { person } = useSession()
  const [billDay, setBillDay] = useState(String(settings.billOnDay))
  const [lateFee, setLateFee] = useState(paiseToRupeesInput(settings.lateFeePerDay))
  const [grace, setGrace] = useState(String(settings.lateFeeAfterDays))
  const [depositDefault, setDepositDefault] = useState('2')
  const [noticeDefault, setNoticeDefault] = useState('30')
  const [rows, setRows] = useState(() =>
    properties
      .filter((p) => p.status !== 'archived')
      .map((p) => ({
        id: p.id,
        name: p.name,
        due: p.rentDueDay,
        notice: p.noticeDays,
        deposit: p.depositMonths,
      })),
  )
  const [error, setError] = useState('')

  function save() {
    const fee = rupeesToPaise(lateFee || '0')
    if (fee === null) {
      setError('Enter the late fee in rupees, like 100. Type 0 for no late fee.')
      return
    }
    setError('')
    updateDb((db) => {
      db.settings.billOnDay = Number(billDay)
      db.settings.lateFeePerDay = fee
      db.settings.lateFeeAfterDays = Number(grace)
      for (const r of rows) {
        const p = db.properties.find((x) => x.id === r.id)
        if (p)
          Object.assign(p, { rentDueDay: r.due, noticeDays: r.notice, depositMonths: r.deposit })
      }
      logActivity(db, {
        by: person.name,
        kind: 'settings',
        action: `Changed the late fee to ${formatMoney(fee)} a day`,
        target: 'Rent settings',
      })
    })
    onboardingStore.set((o) => ({ ...o, rentSettingsSaved: true }))
    toast.success('Rent settings saved', { description: 'They apply from the next bill.' })
  }

  const update = (id: string, k: 'due' | 'notice' | 'deposit', v: number) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)))

  return (
    <div className="grid gap-6">
      <Section title="Bills" description="When monthly rent bills are made.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Make bills on" hint="Day of every month.">
            <NativeSelect value={billDay} onChange={(e) => setBillDay(e.target.value)}>
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                  {i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} of the month
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Default deposit" hint="For new tenants.">
            <NativeSelect
              value={depositDefault}
              onChange={(e) => setDepositDefault(e.target.value)}
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'No deposit' : `${n} month${n > 1 ? 's' : ''}’ rent`}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Default notice period">
            <NativeSelect value={noticeDefault} onChange={(e) => setNoticeDefault(e.target.value)}>
              {[15, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </Section>

      <Section title="Late fee" description="Added to the bill automatically if rent is late.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Late fee per day (₹)" error={error} hint="Type 0 for no late fee.">
            <Input
              inputMode="decimal"
              value={lateFee}
              onChange={(e) => setLateFee(e.target.value)}
            />
          </Field>
          <Field label="Grace days after the due day">
            <NativeSelect value={grace} onChange={(e) => setGrace(e.target.value)}>
              {[0, 1, 2, 3, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'No grace – from the next day' : `${n} day${n > 1 ? 's' : ''}`}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Example: rent due on the 5th, paid on the {5 + Number(grace) + 3}th → late fee{' '}
          {formatMoney((rupeesToPaise(lateFee || '0') ?? 0) * 3)}.
        </p>
      </Section>

      <Section
        title="Per property"
        description="Each property can have its own due day, notice and deposit."
        bodyClassName="p-0"
      >
        <Table>
          <THead>
            <TR>
              <TH>Property</TH>
              <TH>Rent due on</TH>
              <TH>Notice</TH>
              <TH>Deposit</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium whitespace-nowrap">{r.name}</TD>
                <TD>
                  <NativeSelect
                    aria-label={`Rent due day for ${r.name}`}
                    className="w-28"
                    value={r.due}
                    onChange={(e) => update(r.id, 'due', Number(e.target.value))}
                  >
                    {Array.from({ length: 28 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Day {i + 1}
                      </option>
                    ))}
                  </NativeSelect>
                </TD>
                <TD>
                  <NativeSelect
                    aria-label={`Notice for ${r.name}`}
                    className="w-28"
                    value={r.notice}
                    onChange={(e) => update(r.id, 'notice', Number(e.target.value))}
                  >
                    {[15, 30, 45, 60].map((n) => (
                      <option key={n} value={n}>
                        {n} days
                      </option>
                    ))}
                  </NativeSelect>
                </TD>
                <TD>
                  <NativeSelect
                    aria-label={`Deposit for ${r.name}`}
                    className="w-32"
                    value={r.deposit}
                    onChange={(e) => update(r.id, 'deposit', Number(e.target.value))}
                  >
                    {[0, 1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n} month{n === 1 ? '' : 's'}
                      </option>
                    ))}
                  </NativeSelect>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
      <SaveBar onSave={save} />
    </div>
  )
}

/* ------------------------------------------------------------------ payments */

function PaymentsTab() {
  const settings = useDb((db) => db.settings)
  const business = useDb((db) => db.business)
  const [upi, setUpi] = useState(settings.upiId)
  const [bank, setBank] = useState({
    holder: business.name,
    account: '50200012345678',
    ifsc: 'HDFC0001234',
    bank: 'HDFC Bank, HSR Layout',
  })
  const [modes, setModes] = useState({ upi: true, cash: true, bank: true, card: false })
  const [error, setError] = useState('')

  function save() {
    if (!/^[\w.-]{2,}@[a-z]{2,}$/i.test(upi.trim())) {
      setError('A UPI ID looks like name@okhdfc or 9845012345@ybl')
      return
    }
    setError('')
    updateDb((db) => {
      db.settings.upiId = upi.trim()
      logActivity(db, { kind: 'settings', action: 'Changed payment details', target: 'Payments' })
    })
    toast.success('Payment details saved', {
      description: 'New reminders and bills will show these.',
    })
  }

  return (
    <div className="grid gap-6">
      <Section
        title="UPI"
        description="Tenants pay straight to you. The money never passes through PG Manager."
      >
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex size-36 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed bg-secondary/50 text-muted-foreground">
            <QrCode className="size-14" />
            <span className="mt-1 text-[11px]">QR for {upi || '—'}</span>
          </div>
          <div className="grid flex-1 content-start gap-3">
            <Field label="UPI ID" error={error} hint="Shown on bills, reminders and the QR code.">
              <Input value={upi} onChange={(e) => setUpi(e.target.value)} />
            </Field>
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() =>
                toast.success('QR code downloaded', {
                  description: 'Print it and stick it at the office.',
                })
              }
            >
              Download QR to print
            </Button>
          </div>
        </div>
      </Section>
      <Section title="Bank account" description="For tenants who pay by bank transfer.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account holder name">
            <Input
              value={bank.holder}
              onChange={(e) => setBank({ ...bank, holder: e.target.value })}
            />
          </Field>
          <Field label="Account number">
            <Input
              inputMode="numeric"
              value={bank.account}
              onChange={(e) => setBank({ ...bank, account: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="IFSC">
            <Input
              className="uppercase"
              value={bank.ifsc}
              onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Bank and branch">
            <Input value={bank.bank} onChange={(e) => setBank({ ...bank, bank: e.target.value })} />
          </Field>
        </div>
      </Section>
      <Section title="Ways you accept rent">
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxRow
            label="UPI"
            hint="GPay, PhonePe, Paytm…"
            checked={modes.upi}
            onCheckedChange={(v) => setModes({ ...modes, upi: v === true })}
          />
          <CheckboxRow
            label="Cash"
            hint="At the office"
            checked={modes.cash}
            onCheckedChange={(v) => setModes({ ...modes, cash: v === true })}
          />
          <CheckboxRow
            label="Bank transfer"
            hint="NEFT / IMPS"
            checked={modes.bank}
            onCheckedChange={(v) => setModes({ ...modes, bank: v === true })}
          />
          <CheckboxRow
            label="Card"
            hint="With your own card machine"
            checked={modes.card}
            onCheckedChange={(v) => setModes({ ...modes, card: v === true })}
          />
        </div>
      </Section>
      <SaveBar onSave={save} />
    </div>
  )
}

/* ------------------------------------------------------------------ reminders */

function RemindersTab() {
  const settings = useDb((db) => db.settings)
  const business = useDb((db) => db.business)
  const [auto, setAuto] = useState(settings.autoReminders)
  const [before, setBefore] = useState(String(settings.reminderBeforeDays))
  const [channels, setChannels] = useState(settings.reminderChannels)
  const [overdueEvery, setOverdueEvery] = useState('3')
  const [template, setTemplate] = useState(
    'Hi {name}, your rent of {amount} for {month} is due on {due_date}. Please pay by UPI to {upi}. – {business}',
  )
  const toggle = (c: 'whatsapp' | 'sms' | 'email', on: boolean) =>
    setChannels((cs) => (on ? [...new Set([...cs, c])] : cs.filter((x) => x !== c)))

  const preview = template
    .replace(/\{name\}/g, 'Priya')
    .replace(/\{amount\}/g, '₹9,500')
    .replace(/\{month\}/g, 'November')
    .replace(/\{due_date\}/g, '5 Nov')
    .replace(/\{upi\}/g, settings.upiId)
    .replace(/\{business\}/g, business.name)

  function save() {
    if (auto && channels.length === 0) {
      toast.error('Pick at least one way to send reminders, or switch automatic reminders off')
      return
    }
    updateDb((db) => {
      db.settings.autoReminders = auto
      db.settings.reminderBeforeDays = Number(before)
      db.settings.reminderChannels = channels
      logActivity(db, {
        kind: 'settings',
        action: auto ? 'Changed rent reminder settings' : 'Switched off automatic rent reminders',
        target: 'Reminders',
      })
    })
    onboardingStore.set((o) => ({ ...o, rentSettingsSaved: true }))
    toast.success('Reminder settings saved')
  }

  return (
    <div className="grid gap-6">
      <Section title="Automatic reminders">
        <Switch
          checked={auto}
          onChange={setAuto}
          label="Send rent reminders by themselves"
          description="Before the due day, on the due day and while rent is overdue."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="First reminder">
            <NativeSelect
              value={before}
              disabled={!auto}
              onChange={(e) => setBefore(e.target.value)}
            >
              {[1, 2, 3, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {n} day{n > 1 ? 's' : ''} before the due day
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="When overdue, remind every">
            <NativeSelect
              value={overdueEvery}
              disabled={!auto}
              onChange={(e) => setOverdueEvery(e.target.value)}
            >
              {[1, 2, 3, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'Day' : `${n} days`}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <fieldset className="mt-5" disabled={!auto}>
          <legend className="mb-2 text-[13px] font-medium">Send by</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <CheckboxRow
              label="WhatsApp"
              hint="Best – most tenants read it"
              checked={channels.includes('whatsapp')}
              onCheckedChange={(v) => toggle('whatsapp', v === true)}
            />
            <CheckboxRow
              label="SMS"
              hint="Works without internet"
              checked={channels.includes('sms')}
              onCheckedChange={(v) => toggle('sms', v === true)}
            />
            <CheckboxRow
              label="Email"
              checked={channels.includes('email')}
              onCheckedChange={(v) => toggle('email', v === true)}
            />
          </div>
        </fieldset>
      </Section>
      <Section
        title="Message"
        description="Words in {curly brackets} are filled in for each tenant."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="grid content-start gap-2">
            <Field label="Message text">
              <Textarea rows={5} value={template} onChange={(e) => setTemplate(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {['{name}', '{amount}', '{month}', '{due_date}', '{upi}', '{business}'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTemplate((t) => `${t} ${v}`)}
                  className="rounded border bg-secondary px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Preview</p>
            <div className="rounded-xl bg-[#e7ffdb] p-4">
              <div className="max-w-xs rounded-lg rounded-tl-none bg-white p-3 text-sm leading-snug shadow-xs">
                {preview}
                <span className="mt-1 block text-right text-[10px] text-muted-foreground">
                  9:00 am
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => toast.success(`Test message sent to ${business.phone}`)}
            >
              Send a test to my phone
            </Button>
          </div>
        </div>
      </Section>
      <SaveBar onSave={save} />
    </div>
  )
}

/* ------------------------------------------------------------------ receipts */

function ReceiptsTab() {
  const settings = useDb((db) => db.settings)
  const business = useDb((db) => db.business)
  const [footer, setFooter] = useState(settings.receiptFooter)
  const [showGstin, setShowGstin] = useState(true)
  const [showSign, setShowSign] = useState(true)

  function save() {
    updateDb((db) => {
      db.settings.receiptFooter = footer.trim()
      logActivity(db, {
        kind: 'settings',
        action: 'Changed the receipt design',
        target: 'Receipts',
      })
    })
    toast.success('Receipt settings saved')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Receipt details">
        <div className="grid gap-4">
          <Field label="Footer text" hint="A thank-you line or house rules. Up to 160 characters.">
            <Textarea
              rows={3}
              maxLength={160}
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
            />
          </Field>
          <Switch
            checked={showGstin}
            onChange={setShowGstin}
            label="Show GSTIN"
            description={business.gstin || 'Add a GSTIN in Business profile first'}
          />
          <Switch
            checked={showSign}
            onChange={setShowSign}
            label="Show “Computer-made receipt, no signature needed”"
          />
        </div>
        <SaveBar onSave={save} />
      </Section>
      <div>
        <p className="mb-2 text-[13px] font-medium">Live preview</p>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                {business.logoText}
              </span>
              <div>
                <p className="text-sm font-semibold">{business.name}</p>
                <p className="text-[11px] text-muted-foreground">{business.address}</p>
                {showGstin && business.gstin && (
                  <p className="text-[11px] text-muted-foreground">GSTIN {business.gstin}</p>
                )}
              </div>
            </div>
            <Badge tone="good">Paid</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-2 py-3 text-xs">
            <dt className="text-muted-foreground">Receipt</dt>
            <dd className="text-right font-medium">RCPT-00412</dd>
            <dt className="text-muted-foreground">Date</dt>
            <dd className="text-right">{formatDate(TODAY)}</dd>
            <dt className="text-muted-foreground">Tenant</dt>
            <dd className="text-right">Priya Sharma · Room 203 · Bed B</dd>
            <dt className="text-muted-foreground">For</dt>
            <dd className="text-right">November 2026 rent</dd>
            <dt className="text-muted-foreground">Paid by</dt>
            <dd className="text-right">UPI · 4312 8890 1123</dd>
          </dl>
          <div className="flex items-center justify-between border-y py-2.5 text-sm font-semibold">
            <span>Amount received</span>
            <span className="tabular-nums">₹9,500</span>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">{footer || ' '}</p>
          {showSign && (
            <p className="mt-1 text-center text-[10px] text-muted-foreground">
              Computer-made receipt, no signature needed.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ notifications */

const EVENTS = [
  ['payment', 'A tenant pays rent', 'Each time a payment is recorded.'],
  ['overdue', 'Rent becomes overdue', 'Once a day, a list of who is late.'],
  ['complaint', 'New complaint', 'Right away for high and urgent ones.'],
  ['enquiry', 'New enquiry from your listing', ''],
  ['checkin', 'Check-in or check-out tomorrow', ''],
  ['document', 'A document is about to expire', '30 days before.'],
  ['team', 'Team member accepts an invite', ''],
  ['summary', 'Weekly summary on Monday morning', 'Beds, rent and complaints in one message.'],
] as const

function NotificationsTab() {
  const [on, setOn] = useState<Record<string, boolean>>({
    payment: true,
    overdue: true,
    complaint: true,
    enquiry: true,
    checkin: true,
    document: true,
    team: false,
    summary: true,
  })
  const [channel, setChannel] = useState('app_whatsapp')
  return (
    <Section
      title="Tell me when…"
      description="Notifications for you only. Your team sets their own."
    >
      <div className="divide-y">
        {EVENTS.map(([k, label, hint]) => (
          <Switch
            key={k}
            checked={on[k] ?? false}
            onChange={(v) => setOn((o) => ({ ...o, [k]: v }))}
            label={label}
            description={hint || undefined}
          />
        ))}
      </div>
      <Field label="Where" className="mt-5 max-w-sm">
        <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="app">In the app only</option>
          <option value="app_whatsapp">In the app and on WhatsApp</option>
          <option value="app_email">In the app and by email</option>
        </NativeSelect>
      </Field>
      <SaveBar onSave={() => toast.success('Notification settings saved')} />
    </Section>
  )
}

/* ------------------------------------------------------------------ your profile */

function ProfileTab() {
  const { person, role } = useSession()
  const navigate = useNavigate()
  const business = useDb((db) => db.business)
  const isOwner = role === 'owner'
  const [f, setF] = useState({
    name: isOwner ? business.ownerName : person.name,
    phone: isOwner ? business.phone : '',
    email: isOwner ? business.email : person.email,
    language: 'en',
  })
  const [pwOpen, setPwOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', again: '' })
  const [pwErr, setPwErr] = useState<Record<string, string>>({})

  function save() {
    if (f.name.trim().length < 2) {
      toast.error('Enter your name')
      return
    }
    if (isOwner)
      updateDb((db) => {
        db.business.ownerName = f.name.trim()
      })
    toast.success('Your profile is saved')
  }

  function changePassword() {
    const e: Record<string, string> = {}
    if (!pw.current) e.current = 'Enter your current password'
    if (pw.next.length < 8) e.next = 'Use at least 8 characters'
    else if (!/\d/.test(pw.next) || !/[a-z]/i.test(pw.next))
      e.next = 'Use letters and at least one number'
    if (pw.again !== pw.next) e.again = 'The two new passwords are not the same'
    setPwErr(e)
    if (Object.keys(e).length) return
    setPwOpen(false)
    setPw({ current: '', next: '', again: '' })
    toast.success('Password changed')
  }

  return (
    <div className="grid gap-6">
      <Section title="Your profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" required>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Mobile number" hint="You sign in with this. Changing it needs a new code.">
            <Input
              type="tel"
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
              placeholder="98450 12345"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </Field>
          <Field label="Language">
            <NativeSelect
              value={f.language}
              onChange={(e) => setF({ ...f, language: e.target.value })}
            >
              <option value="en">English</option>
              <option value="kn">ಕನ್ನಡ (Kannada) – coming soon</option>
              <option value="hi">हिन्दी (Hindi) – coming soon</option>
            </NativeSelect>
          </Field>
        </div>
        <SaveBar onSave={save} />
      </Section>
      <Section title="Sign-in and security">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="font-medium">Password</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              For signing in with email. Last changed 14 Aug 2026.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setPwOpen(true)}>
              <KeyRound /> Change password
            </Button>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium">Signed-in devices</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              This phone, Chrome on Windows and 1 more.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setSignOutOpen(true)}
            >
              <LogOut /> Sign out of all devices
            </Button>
          </div>
        </div>
      </Section>

      <Dialog
        open={pwOpen}
        onOpenChange={setPwOpen}
        title="Change password"
        footer={
          <>
            <Button variant="outline" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button onClick={changePassword}>Change password</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Current password" error={pwErr.current}>
            <Input
              type="password"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </Field>
          <Field
            label="New password"
            error={pwErr.next}
            hint="At least 8 characters with a number."
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
            />
          </Field>
          <Field label="New password again" error={pwErr.again}>
            <Input
              type="password"
              autoComplete="new-password"
              value={pw.again}
              onChange={(e) => setPw({ ...pw, again: e.target.value })}
            />
          </Field>
        </div>
      </Dialog>
      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out of all devices?"
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={() => {
          setSignOutOpen(false)
          toast.success('Signed out of all devices')
          navigate('/login')
        }}
      >
        You will need your mobile number and a new code to sign in again on every phone and
        computer, including this one.
      </ConfirmDialog>
    </div>
  )
}
