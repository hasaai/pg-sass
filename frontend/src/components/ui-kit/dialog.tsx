import { X } from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** "side" slides in from the right (good for long forms on desktop). */
  variant?: 'center' | 'side'
  className?: string
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  variant = 'center',
  className,
}: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[oklch(0.2_0.02_230/0.38)] backdrop-blur-[2px] data-open:animate-in" />
        <D.Content
          className={cn(
            'fixed z-50 flex flex-col bg-card shadow-xl outline-none',
            variant === 'center'
              ? 'top-1/2 left-1/2 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border data-open:animate-pop'
              : 'inset-y-0 right-0 h-full w-full max-w-xl border-l data-open:animate-slide-in sm:inset-y-2 sm:right-2 sm:h-auto sm:rounded-2xl sm:border',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div>
              <D.Title className="text-[17px] font-semibold tracking-[-0.01em]">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 text-[13px] text-muted-foreground">
                  {description}
                </D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close
              className="-m-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t bg-secondary/30 px-6 py-3.5 sm:rounded-b-2xl">
              {footer}
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
