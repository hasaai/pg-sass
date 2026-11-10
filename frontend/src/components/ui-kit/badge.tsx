import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

const badgeVariants = cva(
  'inline-flex h-[22px] items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-secondary text-secondary-foreground',
        info: 'border-sky-600/15 bg-sky-50 text-sky-800',
        good: 'border-emerald-600/15 bg-emerald-50 text-emerald-800',
        warn: 'border-amber-600/20 bg-amber-50 text-amber-800',
        bad: 'border-red-600/15 bg-red-50 text-red-700',
        outline: 'border-border-strong/70 bg-card text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  dot?: boolean
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}
