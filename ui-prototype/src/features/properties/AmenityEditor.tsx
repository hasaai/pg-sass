import { Checkbox } from '../../components/ui-kit/checkbox'
import { AMENITY_CATALOG } from '../../data/seed'
import { AMENITY_GROUPS as GROUPS } from './lib'

/** Amenities grouped by kind, with "Select all" per group. */
export function AmenityEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const has = new Set(value)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {GROUPS.map((g) => {
        const items = AMENITY_CATALOG.filter((a) => a.group === g)
        const picked = items.filter((a) => has.has(a.key)).length
        const state = picked === items.length ? true : picked === 0 ? false : 'indeterminate'
        return (
          <fieldset key={g} className="rounded-xl border bg-card">
            <legend className="sr-only">{g}</legend>
            <div className="flex items-center justify-between gap-2 border-b bg-secondary/40 px-4 py-2.5">
              <p className="text-sm font-semibold">
                {g}
                <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                  {picked} of {items.length}
                </span>
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
                <Checkbox
                  checked={state}
                  aria-label={`Select all in ${g}`}
                  onCheckedChange={() => {
                    const keys = items.map((a) => a.key as string)
                    onChange(
                      state === true
                        ? value.filter((k) => !keys.includes(k))
                        : [...new Set([...value, ...keys])],
                    )
                  }}
                />
                Select all
              </label>
            </div>
            <div className="grid gap-1 p-2 sm:grid-cols-2">
              {items.map((a) => (
                <label
                  key={a.key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-secondary/60"
                >
                  <Checkbox
                    checked={has.has(a.key)}
                    onCheckedChange={(c) =>
                      onChange(c ? [...value, a.key] : value.filter((k) => k !== a.key))
                    }
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
