/** The tenant's phone app: a narrow column with tabs at the bottom (looks like a phone on desktop). */
import { Bell, Home, IndianRupee, Megaphone, User, Wrench } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'

import { Toaster } from '../components/ui-kit/toaster'
import { placeLabel } from '../data/selectors'
import { useDb } from '../data/store'
import { cn } from '../lib/cn'

const TABS = [
  { to: '/tenant', label: 'Home', icon: Home, end: true },
  { to: '/tenant/rent', label: 'Rent', icon: IndianRupee },
  { to: '/tenant/complaints', label: 'Complaints', icon: Wrench },
  { to: '/tenant/notices', label: 'Notices', icon: Megaphone },
  { to: '/tenant/profile', label: 'Me', icon: User },
]

export function TenantShell() {
  const db = useDb((d) => d)
  const me = db.tenants.find((t) => t.id === 't1')
  const pg = db.properties.find((p) => p.id === me?.propertyId)
  return (
    <div className="min-h-screen bg-slate-200/70 md:py-6">
      <div className="relative mx-auto flex min-h-screen max-w-[420px] flex-col bg-background shadow-xl md:min-h-[860px] md:overflow-hidden md:rounded-[2rem] md:border-8 md:border-slate-900">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur">
          <div className="leading-tight">
            <p className="text-[15px] font-semibold">{pg?.name}</p>
            <p className="text-[11px] text-muted-foreground">{placeLabel(db, me)}</p>
          </div>
          <NavLink
            to="/tenant/notices"
            aria-label="Notifications"
            className="relative rounded-full p-2 text-muted-foreground hover:bg-secondary"
          >
            <Bell className="size-5" />
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500" />
          </NavLink>
        </header>
        <main className="flex-1 px-4 py-4 pb-24">
          <Outlet />
        </main>
        <nav
          aria-label="Tenant app"
          className="sticky bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 backdrop-blur"
        >
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <t.icon className="size-5" />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Toaster />
    </div>
  )
}
