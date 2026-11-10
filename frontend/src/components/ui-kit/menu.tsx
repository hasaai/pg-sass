import { Check } from 'lucide-react'
import { DropdownMenu as M } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../lib/cn'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({
  className,
  align = 'end',
  ...props
}: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg data-open:animate-in',
          className,
        )}
        {...props}
      />
    </M.Portal>
  )
}

export function MenuItem({
  className,
  destructive,
  icon,
  children,
  ...props
}: ComponentProps<typeof M.Item> & { destructive?: boolean; icon?: ReactNode }) {
  return (
    <M.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-secondary [&_svg]:size-4 [&_svg]:text-muted-foreground',
        destructive && 'text-destructive data-highlighted:bg-red-50 [&_svg]:text-destructive',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </M.Item>
  )
}

export function MenuCheckItem({
  children,
  className,
  ...props
}: ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem
      className={cn(
        'relative flex cursor-pointer items-center rounded-md py-1.5 pr-2 pl-7 text-sm outline-none select-none data-highlighted:bg-secondary',
        className,
      )}
      {...props}
    >
      <M.ItemIndicator className="absolute left-2">
        <Check className="size-4" />
      </M.ItemIndicator>
      {children}
    </M.CheckboxItem>
  )
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof M.Label>) {
  return (
    <M.Label
      className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

export function MenuSeparator() {
  return <M.Separator className="-mx-1 my-1 h-px bg-border" />
}
