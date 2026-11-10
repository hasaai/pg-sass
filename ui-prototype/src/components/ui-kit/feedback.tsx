import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { errorMessage } from '../../lib/errors'
import { cn } from '../../lib/cn'

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-secondary', className)} {...props} />
}

const ALERT = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-900', icon: Info },
  warn: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: TriangleAlert },
  bad: { box: 'border-red-200 bg-red-50 text-red-900', icon: AlertCircle },
  good: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
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
      className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', box, className)}
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
        'flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
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
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
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
          'h-full rounded-full',
          pct >= 90 ? 'bg-success' : pct >= 50 ? 'bg-primary' : 'bg-warning',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
