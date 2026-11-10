import { Building2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router'

import { useAuth } from '../auth/AuthContext'
import { homeFor } from '../auth/redirects'
import { cn } from '../lib/cn'
import { Button } from './ui-kit/button'

/** The PG Manager mark: the same small jade square as the app sidebar. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.52_0.1_178)] to-[oklch(0.34_0.07_195)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_1px_2px_rgb(15_23_32/0.2)]',
        className,
      )}
    >
      <Building2 className="size-4" />
    </span>
  )
}

/** Logo link to the home page. */
export function BrandLink() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2.5 rounded-md text-foreground no-underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
    >
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">PG Manager</span>
    </Link>
  )
}

/**
 * Sign-in and sign-up screens: the form on the left, a calm side panel on the right
 * (stacked under the form on a phone).
 */
export function AuthScreen({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-6xl gap-10 px-4 py-8 sm:px-6 sm:py-14',
        aside && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16',
      )}
    >
      <div className="mx-auto w-full max-w-[420px] animate-in lg:pt-6">{children}</div>
      {aside && <aside className="min-w-0">{aside}</aside>}
    </div>
  )
}

/** The soft panel beside an auth form. */
export function AsidePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'h-full rounded-2xl border bg-[oklch(0.972_0.006_190)] p-5 sm:p-8 lg:p-10',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Title block at the top of an auth form. */
export function AuthHeading({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.022em]">{title}</h1>
      {children && (
        <div className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{children}</div>
      )}
    </div>
  )
}

/** Frame for sign-in, sign-up and the mobile code screen. The home page has its own. */
export function PublicLayout() {
  const { status, membership, user } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b bg-card/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <BrandLink />
          <nav aria-label="Account" className="flex items-center gap-1.5">
            {status === 'authenticated' ? (
              <Button asChild size="sm" variant="outline">
                <Link to={homeFor(Boolean(membership), Boolean(user?.is_platform_admin))}>
                  Open my account
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Start free trial</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-[13px] text-muted-foreground sm:px-6">
          <span>PG Manager · Made in Bengaluru</span>
          <nav aria-label="Legal" className="flex gap-5">
            <Link to="/terms" className="text-muted-foreground no-underline hover:text-foreground">
              Terms
            </Link>
            <Link
              to="/privacy"
              className="text-muted-foreground no-underline hover:text-foreground"
            >
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
