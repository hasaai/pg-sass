/** Building blocks for the tenant's phone screens. */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

import { cn } from '../../lib/cn'

/** Screen title with an optional back arrow. */
export function ScreenTitle({
  title,
  back,
  subtitle,
  action,
}: {
  title: ReactNode
  back?: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="mb-4 flex items-start gap-2">
      {back && (
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(back)}
          className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-secondary"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      <div className="min-w-0 flex-1 pt-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

export function TCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-xs', className)}>
      {children}
    </section>
  )
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  )
}

/** A tappable row inside a card list. */
export function RowLink({
  to,
  onClick,
  icon,
  title,
  subtitle,
  end,
}: {
  to?: string
  onClick?: () => void
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  end?: ReactNode
}) {
  const body = (
    <>
      {icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground [&_svg]:size-5">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-[13px] text-muted-foreground">{subtitle}</span>
        )}
      </span>
      {end}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </>
  )
  const cls =
    'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 active:bg-secondary'
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

export function Pill({
  tone,
  children,
}: {
  tone: 'good' | 'warn' | 'bad' | 'info' | 'neutral'
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        {
          good: 'bg-emerald-100 text-emerald-800',
          warn: 'bg-amber-100 text-amber-900',
          bad: 'bg-red-100 text-red-700',
          info: 'bg-blue-100 text-blue-800',
          neutral: 'bg-secondary text-secondary-foreground',
        }[tone],
      )}
    >
      {children}
    </span>
  )
}
