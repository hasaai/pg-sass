import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      offset={{ top: 64, right: 16 }}
      mobileOffset={{ top: 64 }}
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border bg-card text-foreground shadow-lg text-sm font-medium',
          description: 'text-muted-foreground',
        },
      }}
    />
  )
}
