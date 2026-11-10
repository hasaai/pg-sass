import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { errorMessage } from '../../lib/errors'
import { cn } from '../../lib/cn'

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--color-secondary)_25%,oklch(0.985_0.003_220)_50%,var(--color-secondary)_75%)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  )
}

const ALERT = {
  info: { box: 'border-sky-600/15 bg-sky-50/80 text-sky-950 [&>svg]:text-sky-600', icon: Info },
  warn: {
    box: 'border-amber-600/20 bg-amber-50/80 text-amber-950 [&>svg]:text-amber-600',
    icon: TriangleAlert,
  },
  bad: {
    box: 'border-red-600/15 bg-red-50/80 text-red-950 [&>svg]:text-red-600',
    icon: AlertCircle,
  },
  good: {
    box: 'border-emerald-600/15 bg-emerald-50/80 text-emerald-950 [&>svg]:text-emerald-600',
    icon: CheckCircle2,
  },
}

export function Alert({
  tone = 'info',
  title,
  children,
  actions,
  className,
}: {
  tone?: keyof typeof ALERT
  title?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  const { box, icon: Icon } = ALERT[tone]
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-xl border px-4 py-3 text-sm data-open:animate-in',
        box,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-1', 'opacity-90')}>{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-start gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorAlert({
  error,
  fields,
  className,
}: {
  error: unknown
  fields?: string[]
  className?: string
}) {
  const message = errorMessage(error, fields)
  if (!message) return null
  return (
    <Alert tone="bad" className={className}>
      {message}
    </Alert>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong/70 bg-card px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border bg-gradient-to-b from-card to-secondary text-muted-foreground shadow-xs [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
      {children && (
        <div className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 data-open:animate-in">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.022em] text-foreground">
          {title}
        </h1>
        {description && (
          <div className="mt-1.5 max-w-2xl text-[14px] text-muted-foreground">{description}</div>
        )}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="group rounded-xl border bg-card p-4 shadow-xs transition-shadow duration-200 hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span className="flex size-7 items-center justify-center rounded-md bg-secondary text-muted-foreground [&_svg]:size-3.5">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2.5 text-[26px] leading-none font-semibold tracking-[-0.025em] tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

/** A thin bar, e.g. beds filled. `value` and `max` are counts. */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          pct >= 90 ? 'bg-success' : pct >= 50 ? 'bg-primary' : 'bg-warning',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
