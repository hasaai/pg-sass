import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export const fieldBase =
  'w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:bg-secondary/60 disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/15'

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
      className={cn(fieldBase, 'select-arrow h-9 appearance-none pr-8', className)}
      {...props}
    >
      {children}
    </select>
  )
}
