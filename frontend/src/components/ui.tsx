/**
 * The first set of shared components. They keep their original names and props so every screen
 * that uses them keeps working, but they now draw with the design system (ui-kit + Tailwind).
 * New screens should use `components/ui-kit` directly.
 */
import { ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

import { ApiError } from '../api/client'
import { cn } from '../lib/cn'
import { formatMonth, shiftPeriod, titleCase } from '../lib/format'
import { Alert } from './ui-kit/feedback'
import { Button as KitButton } from './ui-kit/button'
import { Badge as KitBadge } from './ui-kit/badge'
import { fieldBase } from './ui-kit/input'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  busy?: boolean
}

const BUTTON_VARIANT = {
  primary: 'default',
  secondary: 'outline',
  danger: 'destructive',
  ghost: 'ghost',
} as const

export function Button({
  variant = 'primary',
  busy,
  children,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  return (
    <KitButton
      variant={BUTTON_VARIANT[variant]}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={className}
      {...rest}
    >
      {busy && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </KitButton>
  )
}

interface FieldProps {
  label: string
  error?: string
  hint?: string
  children: (id: string, describedBy: string | undefined) => ReactNode
}

export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p className="text-xs text-muted-foreground" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="text-xs font-medium text-destructive" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  hint?: string
}

export function TextField({ label, error, hint, className, ...rest }: InputFieldProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <input
          id={id}
          data-slot="input"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(fieldBase, 'h-9 py-1', rest.type === 'file' && 'h-auto py-1.5', className)}
          {...rest}
        />
      )}
    </Field>
  )
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  error?: string
  hint?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

const SELECT_ARROW = 'select-arrow appearance-none pr-8'

export function SelectField({
  label,
  error,
  hint,
  options,
  placeholder,
  className,
  ...rest
}: SelectFieldProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <select
          id={id}
          data-slot="input"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            fieldBase,
            'h-9',
            SELECT_ARROW,
            rest.multiple && 'no-arrow h-auto py-1.5 pr-3',
            className,
          )}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }

export function TextAreaField({ label, error, className, ...rest }: TextAreaProps) {
  return (
    <Field label={label} error={error}>
      {(id, describedBy) => (
        <textarea
          id={id}
          data-slot="input"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(fieldBase, 'min-h-20 py-2', className)}
          {...rest}
        />
      )}
    </Field>
  )
}

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm', className)}>
      <input
        type="checkbox"
        data-slot="input"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-[5px] border-border-strong accent-[var(--color-primary)]"
        {...rest}
      />
      <span>{label}</span>
    </label>
  )
}

/** Shows the server's message for errors that are not tied to one form field. */
export function ErrorBanner({ error, fields = [] }: { error: unknown; fields?: string[] }) {
  if (!error) return null
  let message = 'Something went wrong.'
  if (error instanceof ApiError) {
    const unhandled = Object.keys(error.fields).filter((f) => !fields.includes(f))
    if (error.code === 'validation_error' && unhandled.length === 0) return null
    message =
      error.code === 'validation_error'
        ? unhandled.map((f) => `${titleCase(f)}: ${error.fieldError(f) ?? 'invalid'}`).join(' ')
        : error.message
  } else if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  }
  return (
    <Alert tone="bad" className="mb-4">
      {message}
    </Alert>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="grid gap-3 py-2" aria-label={label}>
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden
          className="h-12 animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--color-secondary)_25%,oklch(0.985_0.003_220)_50%,var(--color-secondary)_75%)] bg-[length:200%_100%]"
          style={{ opacity: 1 - i * 0.25 }}
        />
      ))}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong/70 bg-card px-6 py-12 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl border bg-gradient-to-b from-card to-secondary text-muted-foreground shadow-xs">
        <Inbox className="size-5" aria-hidden />
      </div>
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
      {children && (
        <div className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  )
}

const BADGE_TONES: Record<string, 'good' | 'info' | 'warn' | 'bad' | 'neutral'> = {
  vacant: 'good',
  paid: 'good',
  resolved: 'good',
  closed: 'neutral',
  converted: 'good',
  active: 'good',
  occupied: 'info',
  in_progress: 'info',
  contacted: 'info',
  visit_scheduled: 'info',
  reserved: 'warn',
  partially_paid: 'warn',
  notice: 'warn',
  new: 'warn',
  open: 'warn',
  issued: 'warn',
  overdue: 'bad',
  high: 'bad',
  blocked: 'neutral',
  void: 'neutral',
  lost: 'neutral',
  draft: 'warn',
  inactive: 'neutral',
  archived: 'neutral',
}

export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <KitBadge tone={BADGE_TONES[value] ?? 'neutral'} dot>
      {label ?? titleCase(value)}
    </KitBadge>
  )
}

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-5 rounded-xl border bg-card shadow-xs', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
          {title && (
            <h2 className="text-[15px] leading-6 font-semibold tracking-[-0.01em]">{title}</h2>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.022em]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: ReactNode
  tone?: 'bad' | 'good'
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-2 text-[22px] leading-none font-semibold tracking-[-0.025em] tabular-nums',
          tone === 'bad' && 'text-destructive',
          tone === 'good' && 'text-emerald-700',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** Accessible modal built on the native <dialog> element. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])
  if (!open) return null
  return (
    <dialog
      ref={ref}
      data-slot="dialog"
      aria-label={title}
      onCancel={onClose}
      className="m-auto w-[calc(100vw-2rem)] max-w-lg rounded-2xl border bg-card p-0 text-foreground shadow-xl backdrop:bg-[oklch(0.2_0.02_230/0.38)] backdrop:backdrop-blur-[2px] open:animate-in"
    >
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        <button
          type="button"
          data-slot="button"
          className="-m-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{children}</div>
    </dialog>
  )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto [scrollbar-width:thin]">
      <table data-slot="table" className="w-full border-collapse text-sm">
        <thead className="bg-secondary/50">
          <tr className="border-y">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle [&_td]:tabular-nums [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_tr]:transition-colors [&_tr:hover]:bg-secondary/45 [&_tr:last-child_td]:border-b-0">
          {children}
        </tbody>
      </table>
    </div>
  )
}

/** ‹ October 2026 › — month picker used by billing, finance and staff screens. */
export function PeriodSwitcher({
  period,
  onChange,
}: {
  period: string
  onChange: (period: string) => void
}) {
  return (
    <span className="inline-flex h-9 items-center rounded-lg border bg-card shadow-xs">
      <KitButton
        variant="ghost"
        size="icon"
        className="h-[34px] rounded-r-none"
        aria-label="Previous month"
        onClick={() => onChange(shiftPeriod(period, -1))}
      >
        <ChevronLeft />
      </KitButton>
      <span className="min-w-32 border-x px-3 text-center text-[13px] font-medium tabular-nums">
        {formatMonth(period)}
      </span>
      <KitButton
        variant="ghost"
        size="icon"
        className="h-[34px] rounded-l-none"
        aria-label="Next month"
        onClick={() => onChange(shiftPeriod(period, 1))}
      >
        <ChevronRight />
      </KitButton>
    </span>
  )
}
