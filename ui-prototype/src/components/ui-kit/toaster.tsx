import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      offset={{ top: 64, right: 16 }}
      mobileOffset={{ top: 64 }}
      toastOptions={{
        classNames: {
          toast: 'rounded-lg border bg-card text-foreground shadow-lg text-sm',
          description: 'text-muted-foreground',
        },
      }}
    />
  )
}
