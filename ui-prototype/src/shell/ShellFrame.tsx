/** The frame shared by the operator app and the platform admin portal. */
import {
  Building2,
  LogOut,
  Menu as MenuIcon,
  PanelLeft,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import type { ComponentType, FormEvent, ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'

import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../components/ui-kit/menu'
import { Toaster } from '../components/ui-kit/toaster'
import { Tooltip, TooltipProvider } from '../components/ui-kit/tooltip'
import { useSession } from '../demo/session'
import { cn } from '../lib/cn'
import { initials } from '../lib/format'
import { BreadcrumbProvider, Breadcrumbs } from './breadcrumbs'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
  badge?: number
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

const COLLAPSED_KEY = 'pg.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function SidebarNav({
  groups,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[]
  collapsed: boolean
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </p>
            )}
            <ul className="grid gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    aria-label={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-slate-600 no-underline transition-colors hover:bg-slate-200/60 hover:text-foreground',
                        collapsed && 'justify-center px-0',
                        isActive && 'bg-card text-foreground shadow-xs ring-1 ring-border',
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.badge ? (
                      <span className="rounded-full bg-red-100 px-1.5 text-[11px] font-semibold text-red-700 tabular-nums">
                        {item.badge}
                      </span>
                    ) : null}
                  </NavLink>
                )
                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip content={item.label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
    </nav>
  )
}

function GlobalSearch({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate()
  const ref = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const term = q.trim()
    navigate(term ? `${to}?q=${encodeURIComponent(term)}` : to)
  }
  return (
    <form role="search" onSubmit={onSubmit} className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        data-slot="input"
        type="search"
        aria-label={label}
        placeholder={`${label}…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-card pr-14 pl-8 text-[13px] shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-secondary px-1.5 text-[11px] text-muted-foreground">
        Ctrl K
      </kbd>
    </form>
  )
}

function UserMenu({ settingsPath }: { settingsPath?: string }) {
  const { person, role } = useSession()
  const navigate = useNavigate()
  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label="Your account"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
          {initials(person.name)}
        </span>
      </MenuTrigger>
      <MenuContent className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{person.name}</p>
          <p className="truncate text-xs text-muted-foreground">{person.email || 'No email'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{person.label}</p>
        </div>
        <MenuSeparator />
        {role !== 'platform' && role !== 'tenant' && (
          <MenuItem icon={<Building2 />} onSelect={() => navigate('/app')}>
            Business app
          </MenuItem>
        )}
        {role === 'platform' && (
          <MenuItem icon={<ShieldCheck />} onSelect={() => navigate('/platform')}>
            Platform admin
          </MenuItem>
        )}
        {settingsPath && (
          <MenuItem icon={<Settings />} onSelect={() => navigate(settingsPath)}>
            Settings
          </MenuItem>
        )}
        <MenuItem icon={<LogOut />} onSelect={() => navigate('/login')}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

export function ShellFrame({
  groups,
  brand,
  sidebarTop,
  search,
  settingsPath,
  headerExtra,
  children,
}: {
  groups: NavGroup[]
  /** Small line under the product name, e.g. "Platform admin". */
  brand?: string
  sidebarTop?: (collapsed: boolean) => ReactNode
  search: { to: string; label: string }
  settingsPath?: string
  /** Extra buttons in the top bar (e.g. notifications). */
  headerExtra?: ReactNode
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  function toggle() {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, v ? '0' : '1')
      } catch {
        /* storage unavailable: keep it for this visit only */
      }
      return !v
    })
  }

  const logo = (small: boolean) => (
    <div
      className={cn('flex h-14 items-center gap-2 border-b px-4', small && 'justify-center px-0')}
    >
      <span className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-white">
        <Building2 className="size-4" />
      </span>
      {!small && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight">PG Manager</span>
          {brand && <span className="block text-[11px] text-muted-foreground">{brand}</span>}
        </span>
      )}
    </div>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <BreadcrumbProvider>
        <div className="flex min-h-screen bg-background">
          <aside
            className={cn(
              'sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-150 lg:flex',
              collapsed ? 'w-16' : 'w-60',
            )}
          >
            {logo(collapsed)}
            {sidebarTop?.(collapsed)}
            <SidebarNav groups={groups} collapsed={collapsed} />
          </aside>

          <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" />
              <D.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-xl outline-none lg:hidden">
                <D.Title asChild>{logo(false)}</D.Title>
                <D.Description className="sr-only">Main menu</D.Description>
                {sidebarTop?.(false)}
                <SidebarNav
                  groups={groups}
                  collapsed={false}
                  onNavigate={() => setMobileOpen(false)}
                />
              </D.Content>
            </D.Portal>
          </D.Root>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur md:px-6">
              <button
                type="button"
                className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-secondary lg:hidden"
                aria-label="Open menu"
                onClick={() => setMobileOpen(true)}
              >
                <MenuIcon className="size-5" />
              </button>
              <button
                type="button"
                className="-ml-1 hidden rounded-md p-1.5 text-muted-foreground hover:bg-secondary lg:block"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={toggle}
              >
                <PanelLeft className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <Breadcrumbs />
              </div>
              <GlobalSearch to={search.to} label={search.label} />
              {headerExtra}
              <UserMenu settingsPath={settingsPath} />
            </header>
            <main
              id="main"
              className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 pb-24 md:px-8"
            >
              {children}
            </main>
          </div>
        </div>
        <Toaster />
      </BreadcrumbProvider>
    </TooltipProvider>
  )
}
