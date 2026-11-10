/** Small pieces used on many screens. Build pages from these + components/ui-kit. */
import { Search, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '../ui-kit/badge'
import { NativeSelect } from '../ui-kit/input'
import { useDb } from '../../data/store'
import { initials } from '../../data/selectors'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad'

/** A status chip from one of the maps in data/selectors.ts, e.g. <Status of={INVOICE_STATUS} value="paid" />. */
export function Status<K extends string>({
  of,
  value,
}: {
  of: Record<K, { label: string; tone: string }>
  value: K
}) {
  const s = of[value]
  return (
    <Badge tone={s.tone as Tone} dot>
      {s.label}
    </Badge>
  )
}

export function Avatar({
  name,
  hue = 220,
  size = 'md',
  className,
}: {
  name: string
  hue?: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const box = {
    sm: 'size-7 text-[11px]',
    md: 'size-9 text-xs',
    lg: 'size-12 text-sm',
    xl: 'size-16 text-lg',
  }[size]
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        box,
        className,
      )}
      style={{ background: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.38 0.12 ${hue})` }}
    >
      {initials(name)}
    </span>
  )
}

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(value)}</span>
}

/** Search box with a clear button. */
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative min-w-48 flex-1', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        data-slot="input"
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-card pr-8 pl-8 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** Pill buttons for quick filters ("All", "Overdue", …). */
export function FilterChips<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: V; label: string; count?: number }[]
  value: V
  onChange: (v: V) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
            value === o.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-card text-foreground hover:bg-secondary',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 text-[11px] tabular-nums',
                value === o.value ? 'bg-white/20' : 'bg-secondary text-muted-foreground',
              )}
            >
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/** "All properties" / one property picker used on most lists. */
export function PropertyPicker({
  value,
  onChange,
  className,
  allLabel = 'All properties',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  allLabel?: string
}) {
  const properties = useDb((db) => db.properties)
  return (
    <NativeSelect
      aria-label="Property"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('h-9 w-auto min-w-44', className)}
    >
      <option value="">{allLabel}</option>
      {properties.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </NativeSelect>
  )
}

/** A row of controls above a list. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>{children}</div>
}

/** Label / value pairs in a grid (details sections). */
export function DetailList({
  items,
  cols = 3,
}: {
  items: [string, ReactNode][]
  cols?: 2 | 3 | 4
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        cols === 2
          ? 'sm:grid-cols-2'
          : cols === 4
            ? 'sm:grid-cols-2 lg:grid-cols-4'
            : 'sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 text-sm font-medium break-words">{v || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A soft coloured block standing in for a photo. */
export function PhotoTile({
  hue,
  caption,
  className,
}: {
  hue: number
  caption?: string
  className?: string
}) {
  return (
    <div
      className={cn('relative flex aspect-[4/3] items-end overflow-hidden rounded-lg', className)}
      style={{
        background: `linear-gradient(135deg, oklch(0.85 0.07 ${hue}), oklch(0.62 0.1 ${hue + 40}))`,
      }}
    >
      {caption && (
        <span className="m-2 rounded bg-black/45 px-1.5 py-0.5 text-[11px] text-white">
          {caption}
        </span>
      )}
    </div>
  )
}

/** Simple bar chart (no chart library needed). */
export function Bars({
  data,
  format = (n: number) => String(n),
  height = 140,
  color = 'bg-primary',
}: {
  data: { label: string; value: number; secondary?: number }[]
  format?: (n: number) => string
  height?: number
  color?: string
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)))
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d) => (
        <div
          key={d.label}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
        >
          <div className="flex w-full flex-1 items-end justify-center gap-1">
            <div
              title={`${d.label}: ${format(d.value)}`}
              className={cn('w-full max-w-8 rounded-t', color)}
              style={{ height: `${(d.value / max) * 100}%` }}
            />
            {d.secondary !== undefined && (
              <div
                title={`${d.label}: ${format(d.secondary)}`}
                className="w-full max-w-8 rounded-t bg-slate-300"
                style={{ height: `${(d.secondary / max) * 100}%` }}
              />
            )}
          </div>
          <span className="truncate text-[11px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Section card with a title row. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-xs', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/** On/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="block text-[13px] text-muted-foreground">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0 size-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}

/** Tabs as links-like buttons with a bottom line (for detail pages). */
export function LineTabs<V extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: V; label: string; count?: number }[]
  value: V
  onChange: (v: V) => void
}) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
            value === t.value
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-secondary px-1.5 text-[11px] text-muted-foreground tabular-nums">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/** Shown when a role may not open a page. */
export function NoAccess({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <p className="text-[15px] font-semibold">You can’t open {what}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask the owner to give you access on the Team page.
      </p>
    </div>
  )
}
