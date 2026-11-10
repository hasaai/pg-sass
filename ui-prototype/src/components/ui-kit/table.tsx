import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        className={cn('w-full caption-bottom border-collapse text-sm', className)}
        {...props}
      />
    </div>
  )
}
export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-secondary/60 [&_tr]:border-b', className)} {...props} />
}
export function TBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}
export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-b transition-colors hover:bg-secondary/40 data-[state=selected]:bg-accent',
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
        'h-10 border-0 bg-transparent px-3 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  )
}
export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-0 px-3 py-3 align-middle', className)} {...props} />
}
