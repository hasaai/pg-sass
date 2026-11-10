/** Room features (balcony, geyser, TV ...) chosen from the amenity catalog, each included or extra. */
import { CheckboxRow } from '../../../components/ui-kit/checkbox'
import { Segmented } from '../../../components/ui-kit/choice-cards'
import { Skeleton } from '../../../components/ui-kit/feedback'
import { Input } from '../../../components/ui-kit/input'
import { useFeatureChoices } from './featureRows'
import type { FeatureRow } from './featureRows'

export function RoomFeaturesField({
  value,
  onChange,
  error,
}: {
  value: FeatureRow[]
  onChange: (rows: FeatureRow[]) => void
  error?: string
}) {
  const choices = useFeatureChoices()
  if (choices.isLoading) return <Skeleton className="h-32" />
  const picked = new Map(value.map((r) => [r.amenity, r]))
  const update = (key: string, patch: Partial<FeatureRow>) =>
    onChange(value.map((r) => (r.amenity === key ? { ...r, ...patch } : r)))

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-[13px] font-medium">More in this room</legend>
      <p className="-mt-2 text-xs text-muted-foreground">
        Tick what the room has. Mark it “Extra” to add a monthly charge to each tenant’s rent bill.
      </p>
      <div className="grid gap-2">
        {(choices.data ?? []).map((c) => {
          const row = picked.get(c.key)
          return (
            <div key={c.key} className="rounded-lg border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CheckboxRow
                  label={c.name}
                  checked={Boolean(row)}
                  onCheckedChange={(v) =>
                    onChange(
                      v === true
                        ? [...value, { amenity: c.key, charge: 'included', amount: '' }]
                        : value.filter((r) => r.amenity !== c.key),
                    )
                  }
                />
                {row && (
                  <Segmented
                    label={`${c.name}: included or extra`}
                    value={row.charge}
                    onChange={(v) => update(c.key, { charge: v })}
                    options={[
                      { value: 'included', label: 'In rent' },
                      { value: 'extra', label: 'Extra' },
                    ]}
                  />
                )}
              </div>
              {row?.charge === 'extra' && (
                <label className="mt-2 flex items-center gap-2 text-[13px]">
                  <span className="text-muted-foreground">Extra per tenant, per month ₹</span>
                  <Input
                    className="w-28"
                    inputMode="decimal"
                    aria-label={`${c.name} extra charge per month`}
                    placeholder="e.g. 500"
                    value={row.amount}
                    onChange={(e) => update(c.key, { amount: e.target.value })}
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>
      {error && (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
