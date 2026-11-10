/**
 * Amenities picker for the property form: category navigation, search, multi-select,
 * chips, and per-amenity details showing only the fields that amenity supports.
 */
import { useId, useMemo, useState } from 'react'

import type { AmenityAttribute, AmenityCatalog, CatalogAmenity, Room } from '../api/types'
import { amenityIndex, newDraft, offerLabel, visibleCategories } from '../lib/amenities'
import type { AmenityDraft, DetailValue, DraftErrors, Drafts } from '../lib/amenities'
import { Button, ErrorBanner, Spinner } from './ui'

interface Props {
  catalog: AmenityCatalog | undefined
  loading: boolean
  error: unknown
  onRetry: () => void
  propertyType: string
  value: Drafts
  onChange: (next: Drafts) => void
  errors: DraftErrors
  /** Rooms of an existing property, for amenities limited to some rooms. */
  rooms: Room[]
}

/** Show this many chips, then "+N more" (long lists crowd small screens). */
const CHIP_LIMIT = 10

const SHARING = [
  { value: '', label: 'Not specified' },
  { value: 'shared', label: 'Shared' },
  { value: 'private', label: 'Private' },
]
const CHARGE = [
  { value: '', label: 'Not specified' },
  { value: 'included', label: 'Included in rent' },
  { value: 'extra', label: 'Additional charge' },
]
const PERIOD = [
  { value: 'month', label: 'per month' },
  { value: 'one_time', label: 'one time' },
  { value: 'per_use', label: 'per use' },
]

function Select({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  error?: string
}) {
  const id = useId()
  return (
    <div className="field compact">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  error,
  unit,
  min,
  max,
  inputMode = 'numeric',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  unit?: string
  min?: number
  max?: number
  inputMode?: 'numeric' | 'decimal'
}) {
  const id = useId()
  return (
    <div className="field compact">
      <label htmlFor={id}>
        {label}
        {unit ? ` (${unit})` : ''}
      </label>
      <input
        id={id}
        inputMode={inputMode}
        value={value}
        min={min}
        max={max}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

function AttributeField({
  attr,
  value,
  onChange,
}: {
  attr: AmenityAttribute
  value: DetailValue | undefined
  onChange: (v: DetailValue | undefined) => void
}) {
  const options = (attr.options ?? []).map(([v, l]) => ({ value: v ?? '', label: l ?? v ?? '' }))
  if (attr.type === 'choice')
    return (
      <Select
        label={attr.label}
        value={typeof value === 'string' ? value : ''}
        options={[{ value: '', label: 'Not specified' }, ...options]}
        onChange={(v) => onChange(v || undefined)}
      />
    )
  if (attr.type === 'bool')
    return (
      <Select
        label={attr.label}
        value={value === true ? 'yes' : value === false ? 'no' : ''}
        options={[
          { value: '', label: 'Not specified' },
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        onChange={(v) => onChange(v === '' ? undefined : v === 'yes')}
      />
    )
  if (attr.type === 'int')
    return (
      <NumberInput
        label={attr.label}
        unit={attr.unit}
        min={attr.min}
        max={attr.max}
        value={value === undefined ? '' : String(value)}
        onChange={(v) => onChange(v.trim() === '' ? undefined : v)}
      />
    )
  const picked = Array.isArray(value) ? value : []
  return (
    <fieldset className="field compact multi-options">
      <legend>{attr.label}</legend>
      {options.map((o) => (
        <label key={o.value} className="checkbox">
          <input
            type="checkbox"
            checked={picked.includes(o.value)}
            onChange={(e) =>
              onChange(
                e.target.checked ? [...picked, o.value] : picked.filter((p) => p !== o.value),
              )
            }
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

/** The details panel for one selected amenity: only the fields it supports. */
export function AmenityDetails({
  amenity,
  draft,
  onChange,
  errors = {},
  rooms,
}: {
  amenity: CatalogAmenity
  draft: AmenityDraft
  onChange: (d: AmenityDraft) => void
  errors?: Record<string, string>
  rooms: Room[]
}) {
  const set = (patch: Partial<AmenityDraft>) => onChange({ ...draft, ...patch })
  const available = draft.status === 'available'
  return (
    <div className="amenity-details" role="group" aria-label={`${amenity.name} details`}>
      <div className="segmented" role="group" aria-label={`${amenity.name} availability`}>
        <button type="button" aria-pressed={available} onClick={() => set({ status: 'available' })}>
          Available
        </button>
        <button
          type="button"
          aria-pressed={!available}
          onClick={() => set({ status: 'unavailable' })}
        >
          Not available
        </button>
      </div>
      {errors.status && <p className="field-error">{errors.status}</p>}
      {available && (
        <div className="amenity-fields">
          {amenity.supports_sharing && (
            <Select
              label="Shared or private"
              value={draft.sharing}
              options={SHARING}
              error={errors.sharing}
              onChange={(v) => set({ sharing: v as AmenityDraft['sharing'] })}
            />
          )}
          {amenity.supports_charge && (
            <Select
              label="Charge"
              value={draft.charge}
              options={CHARGE}
              error={errors.charge}
              onChange={(v) =>
                set({
                  charge: v as AmenityDraft['charge'],
                  ...(v === 'extra' && !draft.charge_period ? { charge_period: 'month' } : {}),
                })
              }
            />
          )}
          {amenity.supports_charge && draft.charge === 'extra' && (
            <>
              <NumberInput
                label="Amount"
                unit="₹"
                inputMode="decimal"
                value={draft.charge_amount}
                error={errors.charge_amount}
                onChange={(v) => set({ charge_amount: v })}
              />
              <Select
                label="Charged"
                value={draft.charge_period || 'month'}
                options={PERIOD}
                error={errors.charge_period}
                onChange={(v) => set({ charge_period: v as AmenityDraft['charge_period'] })}
              />
            </>
          )}
          {amenity.supports_quantity && (
            <NumberInput
              label="How many"
              value={draft.quantity}
              error={errors.quantity}
              onChange={(v) => set({ quantity: v })}
            />
          )}
          {amenity.supports_rooms && (
            <Select
              label="Where"
              value={draft.level}
              options={[
                { value: 'property', label: 'Whole property' },
                { value: 'room', label: 'Selected rooms' },
              ]}
              error={errors.level}
              onChange={(v) => set({ level: v as AmenityDraft['level'] })}
            />
          )}
          {amenity.attributes.map((attr) => (
            <AttributeField
              key={attr.key}
              attr={attr}
              value={draft.details[attr.key]}
              onChange={(v) => {
                const details = { ...draft.details }
                if (v === undefined) delete details[attr.key]
                else details[attr.key] = v
                set({ details })
              }}
            />
          ))}
        </div>
      )}
      {available && amenity.supports_rooms && draft.level === 'room' && (
        <fieldset className="field compact room-picker">
          <legend>Rooms with {amenity.name.toLowerCase()}</legend>
          {rooms.length === 0 ? (
            <p className="muted small">
              Save the property and add its rooms first, then pick them here.
            </p>
          ) : (
            rooms.map((r) => (
              <label key={r.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.rooms.includes(r.id)}
                  onChange={(e) =>
                    set({
                      rooms: e.target.checked
                        ? [...draft.rooms, r.id]
                        : draft.rooms.filter((x) => x !== r.id),
                    })
                  }
                />
                <span>Room {r.number}</span>
              </label>
            ))
          )}
          {errors.rooms && <p className="field-error">{errors.rooms}</p>}
        </fieldset>
      )}
      {errors.details && <p className="field-error">{errors.details}</p>}
      {errors.amenity && <p className="field-error">{errors.amenity}</p>}
      <input
        className="amenity-note"
        aria-label={`${amenity.name} note`}
        placeholder="Note (optional), e.g. timings"
        maxLength={200}
        value={draft.note}
        onChange={(e) => set({ note: e.target.value })}
      />
    </div>
  )
}

export function AmenitiesSection({
  catalog,
  loading,
  error,
  onRetry,
  propertyType,
  value,
  onChange,
  errors,
  rooms,
}: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [allChips, setAllChips] = useState(false)
  const index = useMemo(() => amenityIndex(catalog), [catalog])
  const all = useMemo(() => visibleCategories(catalog, propertyType, ''), [catalog, propertyType])
  const matches = useMemo(
    () => (query.trim() ? visibleCategories(catalog, propertyType, query) : []),
    [catalog, propertyType, query],
  )
  const current = all.find((c) => c.key === active) ?? all[0]
  const shown = query.trim() ? matches : current ? [current] : []
  const selected = Object.values(value)
  const countIn = (keys: string[]) => keys.filter((k) => value[k]).length

  function toggle(key: string, on: boolean) {
    const next = { ...value }
    if (on) {
      next[key] = value[key] ?? newDraft(key)
      setOpen((o) => new Set(o).add(key))
    } else delete next[key]
    onChange(next)
  }

  function selectAll(keys: string[]) {
    const next = { ...value }
    for (const k of keys) next[k] ??= newDraft(k)
    onChange(next)
  }

  function clear(keys?: string[]) {
    if (!keys) return onChange({})
    const next = { ...value }
    for (const k of keys) delete next[k]
    onChange(next)
  }

  if (loading) return <Spinner label="Loading amenities…" />
  if (error)
    return (
      <div className="form">
        <ErrorBanner error={error} />
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  if (all.length === 0)
    return <p className="muted">No amenities are set up for this property type yet.</p>

  return (
    <div className="amenities-picker">
      <div className="amenities-toolbar">
        <input
          type="search"
          aria-label="Search amenities"
          placeholder="Search amenities, e.g. geyser, parking"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted small" role="status">
          {selected.length} selected
        </span>
        {selected.length > 0 && (
          <button type="button" className="link" onClick={() => clear()}>
            Clear all
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <ul className="chips amenity-chips" aria-label="Selected amenities">
          {(allChips ? selected : selected.slice(0, CHIP_LIMIT)).map((d) => {
            const a = index.get(d.amenity)
            if (!a) return null
            return (
              <li key={d.amenity} className={d.status === 'unavailable' ? 'chip-off' : undefined}>
                {d.status === 'unavailable' ? `No ${a.name.toLowerCase()}` : a.name}
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => toggle(d.amenity, false)}
                >
                  ×
                </button>
              </li>
            )
          })}
          {selected.length > CHIP_LIMIT && (
            <li className="chip-more">
              <button type="button" onClick={() => setAllChips((v) => !v)}>
                {allChips ? 'Show fewer' : `+${selected.length - CHIP_LIMIT} more`}
              </button>
            </li>
          )}
        </ul>
      )}

      <div className="amenities-body">
        {!query.trim() && (
          <nav className="amenity-categories" aria-label="Amenity categories">
            {all.map((c) => {
              const n = countIn(c.amenities.map((a) => a.key))
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-current={c.key === current?.key || undefined}
                  onClick={() => setActive(c.key)}
                >
                  <span>{c.name}</span>
                  {n > 0 && <span className="count">{n}</span>}
                </button>
              )
            })}
          </nav>
        )}
        <div className="amenity-list">
          {query.trim() && matches.length === 0 && (
            <p className="muted">No amenity matches “{query}”.</p>
          )}
          {shown.map((c) => {
            const keys = c.amenities.map((a) => a.key)
            const allOn = countIn(keys) === keys.length
            return (
              <section key={c.key} aria-label={c.name}>
                <header className="amenity-list-header">
                  <h3>{c.name}</h3>
                  {!query.trim() && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => (allOn ? clear(keys) : selectAll(keys))}
                    >
                      {allOn ? 'Clear category' : 'Select all'}
                    </button>
                  )}
                </header>
                <ul className="amenity-options">
                  {c.amenities.map((a) => {
                    const draft = value[a.key]
                    const itemErrors = errors[a.key]
                    const expanded = Boolean(draft) && (open.has(a.key) || Boolean(itemErrors))
                    return (
                      <li key={a.key} className={itemErrors ? 'has-error' : undefined}>
                        <div className="amenity-row">
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={Boolean(draft)}
                              onChange={(e) => toggle(a.key, e.target.checked)}
                            />
                            <span>{a.name}</span>
                          </label>
                          {draft && (
                            <>
                              <span className="muted small">{offerLabel(draft)}</span>
                              <button
                                type="button"
                                className="link"
                                aria-expanded={expanded}
                                onClick={() =>
                                  setOpen((o) => {
                                    const n = new Set(o)
                                    if (n.has(a.key)) n.delete(a.key)
                                    else n.add(a.key)
                                    return n
                                  })
                                }
                              >
                                {expanded ? 'Hide details' : 'Details'}
                              </button>
                            </>
                          )}
                        </div>
                        {draft && expanded && (
                          <AmenityDetails
                            amenity={a}
                            draft={draft}
                            errors={itemErrors}
                            rooms={rooms}
                            onChange={(d) => onChange({ ...value, [a.key]: d })}
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
      <p className="muted small">
        Unticked means “not specified”. Mark something “Not available” to tell tenants clearly it
        isn’t there.
      </p>
    </div>
  )
}
