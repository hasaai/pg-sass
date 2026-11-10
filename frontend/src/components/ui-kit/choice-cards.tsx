import { RadioGroup as R } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export interface Choice<T extends string> {
  value: T
  label: string
  description?: string
  icon?: ReactNode
}

/** Big selectable cards (radio group), e.g. "What kind of place is it?". */
export function ChoiceCards<T extends string>({
  value,
  onChange,
  choices,
  label,
  columns = 3,
}: {
  value: T | ''
  onChange: (value: T) => void
  choices: Choice<T>[]
  label: string
  columns?: 2 | 3
}) {
  return (
    <R.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T)}
      className={cn('grid gap-3 sm:grid-cols-2', columns === 3 && 'lg:grid-cols-3')}
    >
      {choices.map((c) => (
        <R.Item
          key={c.value}
          value={c.value}
          aria-label={c.label}
          className="group flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=checked]:border-primary data-[state=checked]:bg-accent data-[state=checked]:ring-1 data-[state=checked]:ring-primary"
        >
          {c.icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground [&_svg]:size-5">
              {c.icon}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{c.label}</span>
            {c.description && (
              <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                {c.description}
              </span>
            )}
          </span>
        </R.Item>
      ))}
    </R.Root>
  )
}

/** Small segmented control, e.g. "Bed by bed | Whole room". */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <R.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T)}
      className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-secondary p-0.5 [scrollbar-width:none] [&_button]:whitespace-nowrap"
    >
      {options.map((o) => (
        <R.Item
          key={o.value}
          value={o.value}
          className="cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-xs"
        >
          {o.label}
        </R.Item>
      ))}
    </R.Root>
  )
}
