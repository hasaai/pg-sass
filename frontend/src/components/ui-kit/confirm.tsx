import type { ReactNode } from 'react'

import { Button } from './button'
import { Dialog } from './dialog'
import { ErrorAlert } from './feedback'

/** "Are you sure?" with the consequence spelled out. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  destructive,
  busy,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  error?: unknown
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-sm text-muted-foreground">
        {children}
        <ErrorAlert error={error} />
      </div>
    </Dialog>
  )
}
