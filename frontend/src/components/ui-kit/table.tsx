import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto [scrollbar-width:thin]">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom border-collapse text-sm', className)}
        {...props}
      />
    </div>
  )
}
export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      className={cn('bg-secondary/50 [&_tr]:border-b [&_tr:hover]:bg-transparent', className)}
      {...props}
    />
  )
}
export function TBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}
export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-b transition-colors duration-100 hover:bg-secondary/45 data-[state=selected]:bg-accent',
        className,
      )}
      {...props}
    />
  )
}
export function TH({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-9 border-0 bg-transparent px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5',
        className,
      )}
      {...props}
    />
  )
}
export function TD({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      className={cn('border-0 px-3 py-3 align-middle tabular-nums first:pl-5 last:pr-5', className)}
      {...props}
    />
  )
}
