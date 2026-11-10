/** Small pieces shared by the sign-in and sign-up screens. */
import { ShieldCheck } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ClipboardEvent, KeyboardEvent, ReactNode } from 'react'

import { cn } from '../../lib/cn'

/** Centered card used by every auth screen. */
export function AuthCard({
  title,
  description,
  children,
  footer,
  top,
  wide,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  top?: ReactNode
  wide?: boolean
}) {
  return (
    <div className="flex min-h-[calc(100vh-8.5rem)] items-start justify-center bg-gradient-to-b from-accent/60 to-background px-4 py-10 sm:items-center">
      <div className={cn('w-full', wide ? 'max-w-lg' : 'max-w-md')}>
        {top}
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden />
          Your data is stored in India and never sold.
        </p>
      </div>
    </div>
  )
}

/** Six boxes for a one-time code. Pasting a full code fills every box. */
export function OtpInput({
  value,
  onChange,
  invalid,
  autoFocus = true,
}: {
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  autoFocus?: boolean
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  function setAt(i: number, ch: string) {
    const chars = value.padEnd(6, ' ').split('')
    chars[i] = ch || ' '
    onChange(chars.join('').trimEnd().replace(/ /g, ''))
  }
  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!digits) return
    e.preventDefault()
    onChange(digits)
    refs.current[Math.min(digits.length, 5)]?.focus()
  }
  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          maxLength={1}
          value={value[i] ?? ''}
          onPaste={onPaste}
          onKeyDown={(e) => onKey(i, e)}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-1)
            setAt(i, d)
            if (d && i < 5) refs.current[i + 1]?.focus()
          }}
          className="h-12 w-full min-w-0 rounded-lg border border-input bg-card text-center text-lg font-semibold tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive"
        />
      ))}
    </div>
  )
}

export function MobileInput({
  value,
  onChange,
  id,
  invalid,
  describedBy,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  invalid?: boolean
  describedBy?: string
}) {
  return (
    <div className="flex">
      <span className="inline-flex h-10 items-center rounded-l-md border border-r-0 border-input bg-secondary px-3 text-sm text-muted-foreground">
        +91
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="98450 12345"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, '').slice(0, 11))}
        className="h-10 w-full min-w-0 rounded-r-md border border-input bg-card px-3 text-sm tracking-wide shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive"
      />
    </div>
  )
}

/** Step header used in sign-up: Mobile ✓ · About you · Ready. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-5 flex items-center gap-2" aria-label="Sign-up steps">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done && 'bg-emerald-600 text-white',
                active && 'bg-primary text-primary-foreground',
                !done && !active && 'bg-secondary text-muted-foreground',
              )}
              aria-hidden
            >
              {done ? '✓' : i + 1}
            </span>
            <span
              className={cn(
                'truncate text-[13px]',
                active ? 'font-semibold' : 'text-muted-foreground',
              )}
            >
              {s}
              {done && <span className="sr-only"> (done)</span>}
            </span>
            {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-border sm:block" />}
          </li>
        )
      })}
    </ol>
  )
}
