/** Frame for the landing page, sign-in and sign-up. */
import { Building2 } from 'lucide-react'
import { Link, Outlet } from 'react-router'

import { Toaster } from '../components/ui-kit/toaster'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-white">
              <Building2 className="size-4" />
            </span>
            PG Manager
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              to="/#features"
              className="hidden rounded-md px-3 py-1.5 hover:bg-secondary sm:block"
            >
              Features
            </Link>
            <Link
              to="/#pricing"
              className="hidden rounded-md px-3 py-1.5 hover:bg-secondary sm:block"
            >
              Pricing
            </Link>
            <Link to="/login" className="rounded-md px-3 py-1.5 font-medium hover:bg-secondary">
              Sign in
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90"
            >
              Register my PG
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[13px] text-muted-foreground">
          <span>© 2026 PG Manager · Made in Bengaluru</span>
          <span className="flex gap-4">
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <a href="mailto:hello@pgmanager.in" className="hover:text-foreground">
              Contact
            </a>
          </span>
        </div>
      </footer>
      <Toaster />
    </div>
  )
}
