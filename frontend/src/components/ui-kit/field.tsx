import { Label as LabelPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cloneElement, isValidElement, useId } from 'react'

import { cn } from '../../lib/cn'

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-[13px] font-medium text-foreground select-none', className)}
      {...props}
    />
  )
}

interface FieldProps {
  label: ReactNode
  /** A single input/select/textarea; it gets the id, aria-invalid and aria-describedby. */
  children: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  className?: string
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, children, hint, error, required, className }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && !error ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ')
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
        'aria-required': required || undefined,
      })
    : children
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {' '}
            *
          </span>
        )}
      </Label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
