import { Check, Minus } from 'lucide-react'
import { Checkbox as C } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'

export function Checkbox({ className, ...props }: ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        'peer inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-border-strong bg-card shadow-xs transition-colors outline-none hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <C.Indicator>
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </C.Indicator>
    </C.Root>
  )
}

/** Checkbox with its label to the right, the whole row clickable. */
export function CheckboxRow({
  label,
  hint,
  className,
  ...props
}: ComponentProps<typeof C.Root> & { label: string; hint?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm', className)}>
      <Checkbox className="mt-0.5" {...props} />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}
