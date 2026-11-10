/** Small building blocks shared by the platform admin screens (filter bars, pagers, cells). */
import { ChevronLeft, ChevronRight, MoreHorizontal, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Button } from '../../components/ui-kit/button'
import { Card } from '../../components/ui-kit/card'
import { Menu, MenuContent, MenuTrigger } from '../../components/ui-kit/menu'
import { Skeleton } from '../../components/ui-kit/feedback'
import { cn } from '../../lib/cn'
import { initials } from '../../lib/format'

/** The row above a table: search, filters, selects. Wraps on phones. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 border-b px-4 py-3 md:flex-row md:flex-wrap md:items-center md:px-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Search box with an icon; submits on Enter. */
export function SearchBox({
  label,
  value,
  onChange,
  onSubmit,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  className?: string
}) {
  return (
    <form
      role="search"
      className={cn('relative min-w-0 flex-1 md:max-w-md', className)}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
      <input
        data-slot="input"
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-0 rounded-md border border-input bg-card pr-3 pl-9 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15"
      />
    </form>
  )
}

/** Chip-style filter that scrolls sideways inside itself on small screens. */
export function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="-mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex shrink-0 gap-0.5 rounded-lg border bg-secondary p-0.5"
      >
        {options.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={value === f.value}
            onClick={() => onChange(f.value)}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30',
              value === f.value && 'bg-card text-foreground shadow-xs',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** "128 businesses · Page 2 of 6" with previous / next. */
export function Pager({
  summary,
  page,
  pages,
  onPage,
}: {
  summary: ReactNode
  page: number
  pages: number
  onPage: (page: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-[13px] text-muted-foreground md:px-5">
      <span className="tabular-nums">
        {summary} · Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft /> Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

/** Rows of shimmer shaped like a table: a leading avatar, a name and a meta line. */
export function TableSkeleton({ rows = 5, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          {avatar && <Skeleton className="size-9 shrink-0 rounded-lg" />}
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-2/5 max-w-60" />
            <Skeleton className="h-3 w-3/5 max-w-80" />
          </div>
          <Skeleton className="hidden h-5 w-20 rounded-md sm:block" />
          <Skeleton className="hidden h-3.5 w-16 md:block" />
        </div>
      ))}
    </div>
  )
}

/** A whole page loading: header, KPI row and a big card. */
export function PageSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid gap-5">
      <div className="grid gap-2">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {kpis > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: kpis }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <TableSkeleton rows={4} />
        </Card>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}

const AVATAR_TONES = [
  'from-[oklch(0.62_0.09_178)] to-[oklch(0.45_0.08_195)]',
  'from-[oklch(0.64_0.1_250)] to-[oklch(0.48_0.1_265)]',
  'from-[oklch(0.68_0.11_60)] to-[oklch(0.55_0.12_45)]',
  'from-[oklch(0.62_0.1_320)] to-[oklch(0.5_0.1_300)]',
  'from-[oklch(0.62_0.1_145)] to-[oklch(0.48_0.09_160)]',
]

/** Initials in a soft circle; the colour follows the name so it stays the same. */
export function Avatar({
  name,
  size = 'md',
  square = false,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  square?: boolean
}) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-gradient-to-br font-semibold text-white',
        AVATAR_TONES[hash % AVATAR_TONES.length],
        square ? 'rounded-lg' : 'rounded-full',
        size === 'sm' && 'size-7 text-[10.5px]',
        size === 'md' && 'size-9 text-xs',
        size === 'lg' && 'size-12 text-sm',
      )}
    >
      {initials(name)}
    </span>
  )
}

/** A logo, or a neutral tile with an icon when there is none. */
export function LogoTile({
  src,
  icon,
  size = 'md',
}: {
  src?: string | null
  icon: ReactNode
  size?: 'md' | 'lg'
}) {
  const box = size === 'lg' ? 'size-12 rounded-xl' : 'size-9 rounded-lg'
  return src ? (
    <img src={src} alt="" className={cn(box, 'shrink-0 border bg-card object-cover')} />
  ) : (
    <span
      className={cn(
        box,
        'flex shrink-0 items-center justify-center border bg-gradient-to-b from-card to-secondary text-muted-foreground shadow-xs',
        size === 'lg' ? '[&_svg]:size-5' : '[&_svg]:size-4',
      )}
    >
      {icon}
    </span>
  )
}

/** First column of a table: leading visual, the name (a link when `to`), a small meta line. */
export function NameCell({
  lead,
  name,
  to,
  meta,
  extra,
}: {
  lead?: ReactNode
  name: ReactNode
  to?: string
  meta?: ReactNode
  extra?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {lead}
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {to ? (
            <Link
              to={to}
              className="truncate text-[13.5px] font-medium text-foreground no-underline hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="truncate text-[13.5px] font-medium">{name}</span>
          )}
          {extra}
        </div>
        {meta && <div className="truncate text-xs text-muted-foreground">{meta}</div>}
      </div>
    </div>
  )
}

/** The "…" button at the end of a row that opens its actions. */
export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent>{children}</MenuContent>
    </Menu>
  )
}

/** A KPI tile that can be a link; same look as `StatCard`, with a status-tinted icon. */
export function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
  to,
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'bad' | 'warn' | 'good' | 'info'
  to?: string
  children?: ReactNode
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-snug font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5',
              tone === 'bad'
                ? 'bg-red-50 text-red-600'
                : tone === 'warn'
                  ? 'bg-amber-50 text-amber-600'
                  : tone === 'good'
                    ? 'bg-emerald-50 text-emerald-600'
                    : tone === 'info'
                      ? 'bg-sky-50 text-sky-600'
                      : 'bg-secondary text-muted-foreground',
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 text-[26px] leading-none font-semibold tracking-[-0.025em] tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </>
  )
  const cls =
    'block min-w-0 rounded-xl border bg-card p-4 shadow-xs transition-[box-shadow,border-color] duration-200'
  return to ? (
    <Link
      to={to}
      className={cn(cls, 'text-foreground no-underline hover:border-border-strong hover:shadow-sm')}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** A back link above a page title. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" /> {children}
    </Link>
  )
}

/** A soft dashed note inside a card, for "nothing here yet". */
export function InlineEmpty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-7 text-center text-[13px] text-muted-foreground [&_svg]:size-5 [&_svg]:text-subtle-foreground">
      {icon}
      {children}
    </div>
  )
}

/** Vertical timeline item (activity, history). */
export function TimelineItem({
  title,
  meta,
  note,
  tone = 'neutral',
  last,
}: {
  title: ReactNode
  meta?: ReactNode
  note?: ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'brand'
  last?: boolean
}) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last && (
        <span className="absolute top-4 bottom-0 left-[4.5px] w-px bg-border" aria-hidden />
      )}
      <span
        aria-hidden
        className={cn(
          'relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-card',
          tone === 'good' && 'bg-emerald-500',
          tone === 'warn' && 'bg-amber-500',
          tone === 'bad' && 'bg-red-500',
          tone === 'info' && 'bg-sky-500',
          tone === 'brand' && 'bg-primary',
          tone === 'neutral' && 'bg-border-strong',
        )}
      />
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-medium text-foreground">{title}</p>
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        {note && (
          <p className="mt-1.5 rounded-md bg-secondary/70 px-2.5 py-1.5 text-[12.5px] text-secondary-foreground">
            {note}
          </p>
        )}
      </div>
    </li>
  )
}
