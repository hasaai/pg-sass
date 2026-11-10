import { Check, MessageSquareText } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ComponentProps, FormEvent, ReactNode } from 'react'

import { ApiError, request } from '../../api/client'
import type { AuthResponse } from '../../api/types'
import type { components } from '../../api/schema'
import { ErrorBanner } from '../../components/ui'
import { Button } from '../../components/ui-kit/button'
import { Field } from '../../components/ui-kit/field'
import { fieldBase } from '../../components/ui-kit/input'
import { cn } from '../../lib/cn'
import { countdown } from '../../lib/mobile'

type CodeSent = components['schemas']['CodeSent']

/** Indian mobile number with a fixed "+91" in front (shown only; the typed number is sent). */
export function PhoneInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <div className="flex">
      <span className="flex h-10 shrink-0 items-center rounded-l-md border border-r-0 border-input bg-secondary px-3 text-sm text-muted-foreground tabular-nums select-none">
        +91
      </span>
      <input
        data-slot="input"
        className={cn(
          fieldBase,
          'h-10 rounded-l-none py-1 text-base tabular-nums sm:text-sm',
          className,
        )}
        {...props}
      />
    </div>
  )
}

/**
 * One real input (so paste, SMS autofill and screen readers just work) drawn as six boxes.
 * `value` may hold spaces; only its digits are drawn.
 */
export function CodeInput({
  value,
  className,
  onFocus,
  onBlur,
  ...props
}: Omit<ComponentProps<'input'>, 'value'> & { value: string }) {
  const [focused, setFocused] = useState(false)
  const digits = value.replace(/\D/g, '').slice(0, 6)
  const invalid = Boolean(props['aria-invalid'])
  return (
    <div className={cn('relative', className)}>
      <div aria-hidden className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && (i === digits.length || (digits.length === 6 && i === 5))
          return (
            <div
              key={i}
              className={cn(
                'flex h-12 items-center justify-center rounded-lg border border-input bg-card font-mono text-[22px] font-medium tabular-nums shadow-xs transition-[border-color,box-shadow] duration-150 sm:h-14',
                digits[i] && 'border-border-strong',
                invalid && 'border-destructive/70',
                active && 'border-ring ring-[3px] ring-ring/15',
              )}
            >
              {digits[i] ??
                (active ? <span className="h-6 w-px animate-pulse bg-foreground/70" /> : null)}
            </div>
          )
        })}
      </div>
      <input
        data-slot="input"
        value={value}
        className="absolute inset-0 size-full cursor-text bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent"
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
        {...props}
      />
    </div>
  )
}

const SIGNUP_STEPS = ['Your mobile', '6-digit code', 'Your details']

/** Register → code → profile, shown at the top of each sign-up screen. */
export function SignupSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol aria-label="Sign-up steps" className="mb-7 flex items-center gap-2">
      {SIGNUP_STEPS.map((label, i) => {
        const done = i < current
        const now = i === current
        return (
          <li
            key={label}
            aria-current={now ? 'step' : undefined}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums transition-colors',
                done && 'border-primary bg-primary text-primary-foreground',
                now && 'border-primary bg-primary-soft text-accent-foreground',
                !done && !now && 'border-border-strong bg-card text-subtle-foreground',
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                'truncate text-[12px] font-medium sm:text-[13px]',
                now ? 'shrink-0 text-foreground' : 'hidden text-muted-foreground sm:inline',
              )}
            >
              {label}
            </span>
            {i < SIGNUP_STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn('h-px min-w-3 flex-1', done ? 'bg-primary/60' : 'bg-border-strong')}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Mobile number, then the 6-digit code. Used for owner sign-up and sign-in by mobile.
 * `extra` is sent with both calls (for sign-up: the consent ticks).
 */
export function MobileCodeForm({
  startUrl,
  finishUrl,
  extra = {},
  beforeSend,
  sendLabel = 'Send code',
  canSend = true,
  onStepChange,
  onDone,
}: {
  startUrl: string
  finishUrl: string
  extra?: Record<string, unknown>
  beforeSend?: ReactNode
  sendLabel?: string
  canSend?: boolean
  /** Told when the form moves between the number and the code (only to draw a stepper). */
  onStepChange?: (step: 'mobile' | 'code') => void
  onDone: (data: AuthResponse) => void
}) {
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState<CodeSent | null>(null)
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  useEffect(() => {
    onStepChange?.(sent ? 'code' : 'mobile')
  }, [sent, onStepChange])

  const fieldError = (name: string) =>
    error instanceof ApiError ? error.fieldError(name) : undefined

  async function send(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const reply = await request<CodeSent>(startUrl, {
        method: 'POST',
        body: { phone, ...extra },
        skipRefresh: true,
      })
      setSent(reply)
      setWait(reply.resend_in)
      setCode('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = Number(/Wait (\d+) seconds/.exec(err.message)?.[1] ?? 0)
        if (seconds) setWait(seconds)
      }
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const data = await request<AuthResponse>(finishUrl, {
        method: 'POST',
        body: { phone, code: code.replace(/\D/g, ''), ...extra },
        skipRefresh: true,
      })
      onDone(data)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (!sent) {
    return (
      <form className="grid gap-5" onSubmit={send} noValidate>
        <ErrorBanner error={error} fields={['phone', 'accept_terms', 'accept_privacy']} />
        <Field
          label="Mobile number"
          error={fieldError('phone')}
          hint="We send a 6-digit code to this number by SMS."
        >
          <PhoneInput
            inputMode="tel"
            autoComplete="tel"
            placeholder="98450 12345"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        {beforeSend}
        {(fieldError('accept_terms') || fieldError('accept_privacy')) && (
          <p className="-mt-2 text-xs font-medium text-destructive">
            {fieldError('accept_terms') ?? fieldError('accept_privacy')}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          busy={busy}
          disabled={!canSend || !phone.trim()}
        >
          {sendLabel}
        </Button>
      </form>
    )
  }

  return (
    <form className="grid gap-5" onSubmit={confirm} noValidate>
      <div className="flex gap-3 rounded-lg border bg-secondary/50 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          We sent a 6-digit code to{' '}
          <strong className="font-semibold text-foreground tabular-nums">
            {sent.phone_masked}
          </strong>{' '}
          if this number can be used. It works for 10 minutes.
        </p>
      </div>
      <ErrorBanner error={error} fields={['code']} />
      <Field label="Code" error={fieldError('code')}>
        <CodeInput
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        busy={busy}
        disabled={code.replace(/\D/g, '').length !== 6}
      >
        Confirm
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px]">
        <Button
          variant="link"
          className="h-auto px-0 text-[13px] disabled:text-muted-foreground disabled:opacity-100"
          disabled={wait > 0 || busy}
          onClick={() => void send()}
        >
          {wait > 0 ? `Resend code in ${countdown(wait)}` : 'Resend code'}
        </Button>
        <Button
          variant="link"
          className="h-auto px-0 text-[13px]"
          onClick={() => {
            setSent(null)
            setError(null)
          }}
        >
          Change number
        </Button>
      </div>
    </form>
  )
}
