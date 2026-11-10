import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export const fieldBase =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(fieldBase, 'h-9 py-1', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea data-slot="input" className={cn(fieldBase, 'min-h-20 py-2', className)} {...props} />
  )
}

/** Native select: fast, accessible and works with every keyboard and phone. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="input"
      className={cn(
        fieldBase,
        "h-9 appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23667085' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
