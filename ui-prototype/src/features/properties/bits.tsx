/** Small pieces used by several property screens. */
import { Check, Copy, ExternalLink, MapPin, Search } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '../../components/ui-kit/button'
import { toast } from '../../components/ui-kit/toast'
import { cn } from '../../lib/cn'

/** A drawn map stand-in with a pin. */
export function MapPlaceholder({
  label,
  pinned = true,
  onSearch,
  href,
  className,
}: {
  label: string
  pinned?: boolean
  onSearch?: () => void
  href?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative h-48 overflow-hidden rounded-xl border bg-[oklch(0.96_0.02_150)]',
        className,
      )}
      style={{
        backgroundImage:
          'linear-gradient(oklch(0.92 0.02 150) 1px, transparent 1px), linear-gradient(90deg, oklch(0.92 0.02 150) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >
      <div className="absolute top-[38%] -right-4 -left-4 h-3 -rotate-6 bg-white/90 shadow-sm" />
      <div className="absolute top-0 bottom-0 left-[62%] w-2.5 rotate-12 bg-white/90 shadow-sm" />
      <div className="absolute top-[12%] left-[10%] h-12 w-20 rounded bg-emerald-200/70" />
      <div className="absolute right-[8%] bottom-[14%] h-10 w-24 rounded bg-sky-200/70" />
      {pinned ? (
        <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
          <span className="mb-1 max-w-56 truncate rounded-md bg-card px-2 py-1 text-xs font-medium shadow">
            {label}
          </span>
          <MapPin className="size-8 fill-red-500 text-red-700 drop-shadow" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="rounded-md bg-card/90 px-3 py-1.5 text-[13px] text-muted-foreground shadow-sm">
            Search to drop a pin on your building
          </p>
        </div>
      )}
      <div className="absolute right-3 bottom-3 flex gap-2">
        {onSearch && (
          <Button size="sm" variant="outline" onClick={onSearch}>
            <Search /> Search on map
          </Button>
        )}
        {href && (
          <Button size="sm" variant="outline" asChild>
            <a href={href} target="_blank" rel="noreferrer">
              <ExternalLink /> Open in Google Maps
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).catch(() => undefined)
        setDone(true)
        toast.success(`${text} copied`)
        setTimeout(() => setDone(false), 1500)
      }}
      className="inline-flex items-center gap-1 rounded border bg-secondary px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground hover:text-foreground"
    >
      {text}
      {done ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
    </button>
  )
}

/** Toggle pill used for filters and "room has" choices. */
export function Pill({
  on,
  onClick,
  children,
  dashed,
  className,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
  dashed?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors',
        on
          ? dashed
            ? 'border-primary bg-primary/10 font-medium text-primary'
            : 'border-primary bg-primary text-primary-foreground'
          : cn('bg-card hover:bg-secondary', dashed && 'border-dashed border-input'),
        className,
      )}
    >
      {on && dashed && <Check className="size-3.5" />}
      {children}
    </button>
  )
}
