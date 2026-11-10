import { Archive, ArchiveRestore, PauseCircle, PlayCircle } from 'lucide-react'
import { useState } from 'react'

import { Section, Switch } from '../../../components/common'
import { Button } from '../../../components/ui-kit/button'
import { Field } from '../../../components/ui-kit/field'
import { Input, NativeSelect } from '../../../components/ui-kit/input'
import { toast } from '../../../components/ui-kit/toast'
import { useDb } from '../../../data/store'
import type { Property } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { paiseToRupeesInput, rupeesToPaise } from '../../../lib/format'
import { patchProperty, setPropertyStatus } from '../actions'
import { extra } from '../lib'

export function SettingsTab({
  property: p,
  onArchive,
}: {
  property: Property
  onArchive: () => void
}) {
  const { can } = useSession()
  const lateDefault = useDb((db) => db.settings.lateFeePerDay)
  const initial = {
    rentDueDay: String(p.rentDueDay),
    noticeDays: String(p.noticeDays),
    depositMonths: String(p.depositMonths),
    foodIncluded: p.foodIncluded,
    contactPhone: p.contactPhone,
    lateFee: paiseToRupeesInput(extra(p).lateFeePerDay ?? lateDefault),
  }
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string>>>({})
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  function save() {
    const e: typeof errors = {}
    const int = (v: string, a: number, b: number) => /^\d+$/.test(v) && +v >= a && +v <= b
    if (!int(f.noticeDays, 0, 90)) e.noticeDays = 'Type 0 to 90 days.'
    if (!int(f.depositMonths, 0, 6)) e.depositMonths = 'Type 0 to 6 months.'
    if (f.contactPhone.trim() && f.contactPhone.replace(/\D/g, '').length !== 10)
      e.contactPhone = 'Mobile number has 10 digits, e.g. 98450 12345.'
    if (f.lateFee.trim() && rupeesToPaise(f.lateFee) === null)
      e.lateFee = 'Type an amount in rupees, e.g. 100.'
    setErrors(e)
    if (Object.keys(e).length) return
    patchProperty(
      p.id,
      {
        rentDueDay: Number(f.rentDueDay),
        noticeDays: Number(f.noticeDays),
        depositMonths: Number(f.depositMonths),
        foodIncluded: f.foodIncluded,
        contactPhone: f.contactPhone.trim(),
        lateFeePerDay: rupeesToPaise(f.lateFee) ?? 0,
      },
      'Changed the property settings',
    )
    toast.success('Settings saved')
  }

  return (
    <div className="grid max-w-3xl gap-5">
      <Section
        title="Rent and stay rules"
        description="Used for new bills and new tenants. Bills already made don’t change."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rent is due on">
            <NativeSelect value={f.rentDueDay} onChange={(e) => set('rentDueDay', e.target.value)}>
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i} value={String(i + 1)}>
                  Day {i + 1} of every month
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Notice to move out (days)" error={errors.noticeDays}>
            <Input
              inputMode="numeric"
              value={f.noticeDays}
              onChange={(e) => set('noticeDays', e.target.value)}
            />
          </Field>
          <Field label="Deposit (months of rent)" error={errors.depositMonths}>
            <Input
              inputMode="numeric"
              value={f.depositMonths}
              onChange={(e) => set('depositMonths', e.target.value)}
            />
          </Field>
          {can('rent.view') && (
            <Field label="Late fee per day (₹)" error={errors.lateFee} hint="0 for no late fee.">
              <Input
                inputMode="numeric"
                value={f.lateFee}
                onChange={(e) => set('lateFee', e.target.value)}
              />
            </Field>
          )}
          <Field
            label="Contact number"
            error={errors.contactPhone}
            hint="Shown to tenants and enquiries."
          >
            <Input
              inputMode="tel"
              value={f.contactPhone}
              placeholder="98450 12345"
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          </Field>
          <div className="rounded-lg border px-4 py-1.5 sm:col-span-2">
            <Switch
              checked={f.foodIncluded}
              onChange={(v) => set('foodIncluded', v)}
              label="Food is included in the rent"
              description="Tenants see “Food included” on the listing."
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t pt-4">
          <Button
            variant="outline"
            disabled={!dirty}
            onClick={() => {
              setF(initial)
              setErrors({})
            }}
          >
            Undo changes
          </Button>
          <Button disabled={!dirty} onClick={save}>
            Save settings
          </Button>
        </div>
      </Section>

      <section className="rounded-xl border border-red-200 bg-card shadow-xs">
        <div className="border-b border-red-200 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-red-800">Danger zone</h2>
        </div>
        <div className="divide-y">
          {p.status !== 'archived' && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {p.status === 'active' ? 'Close for now' : 'Open for tenants'}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {p.status === 'active'
                    ? 'Stop new tenants and hide it from your listing, e.g. during repairs. Tenants staying now are not affected.'
                    : 'Let new tenants be added and show it on your listing.'}
                </p>
              </div>
              {p.status === 'active' ? (
                <Button variant="outline" onClick={() => setPropertyStatus(p, 'inactive')}>
                  <PauseCircle /> Close for now
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setPropertyStatus(p, 'active')}>
                  <PlayCircle /> Open for tenants
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {p.status === 'archived' ? 'Restore property' : 'Archive property'}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {p.status === 'archived'
                  ? 'Bring it back to your lists. It comes back as closed for now.'
                  : 'Hide it from all lists when you no longer run it. History is kept.'}
              </p>
            </div>
            {p.status === 'archived' ? (
              <Button variant="outline" onClick={() => setPropertyStatus(p, 'inactive')}>
                <ArchiveRestore /> Restore
              </Button>
            ) : (
              <Button variant="destructive" onClick={onArchive}>
                <Archive /> Archive
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
