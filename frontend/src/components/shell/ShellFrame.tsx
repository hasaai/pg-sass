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
import { NavLink, useLocation, useNavigate } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { cn } from '../../lib/cn'
import { initials } from '../../lib/format'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui-kit/menu'
import { Toaster } from '../ui-kit/toaster'
import { Tooltip, TooltipProvider } from '../ui-kit/tooltip'
import { BreadcrumbProvider, Breadcrumbs } from './breadcrumbs'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
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
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-width:thin]">
      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed ? (
              <p className="px-2.5 pb-1.5 text-[11.5px] font-medium text-subtle-foreground">
                {group.label}
              </p>
            ) : (
              <div className="mx-3 mb-2 h-px bg-border" aria-hidden />
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
                        'group/nav flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-[oklch(0.42_0.02_230)] no-underline transition-colors duration-100 hover:bg-[oklch(0.935_0.006_215)] hover:text-foreground',
                        collapsed && 'justify-center px-0',
                        isActive &&
                          'bg-sidebar-active text-foreground shadow-xs ring-1 ring-border [&_svg]:text-primary',
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0 text-[oklch(0.55_0.018_230)] transition-colors group-hover/nav:text-foreground" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
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
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
      <input
        ref={ref}
        data-slot="input"
        type="search"
        aria-label={label}
        placeholder={`${label}…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-secondary/60 pr-14 pl-9 text-[13px] outline-none transition-[background-color,border-color,box-shadow] placeholder:text-subtle-foreground hover:bg-secondary focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/15"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-md border bg-card px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground shadow-xs">
        Ctrl K
      </kbd>
    </form>
  )
}

function UserMenu({ settingsPath }: { settingsPath?: string }) {
  const { user, membership, logout } = useAuth()
  const navigate = useNavigate()
  const name = user?.full_name ?? ''
  return (
    <Menu>
      <MenuTrigger
        className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label="Your account"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.5_0.09_178)] to-[oklch(0.32_0.06_200)] text-xs font-semibold text-white ring-2 ring-card">
          {initials(name)}
        </span>
      </MenuTrigger>
      <MenuContent className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          {membership && (
            <p className="mt-0.5 text-xs text-muted-foreground capitalize">{membership.role}</p>
          )}
        </div>
        <MenuSeparator />
        {membership && (
          <MenuItem icon={<Building2 />} onSelect={() => navigate('/app')}>
            Business app
          </MenuItem>
        )}
        {user?.is_platform_admin && (
          <MenuItem icon={<ShieldCheck />} onSelect={() => navigate('/platform')}>
            Platform admin
          </MenuItem>
        )}
        {settingsPath && (
          <MenuItem icon={<Settings />} onSelect={() => navigate(settingsPath)}>
            Settings
          </MenuItem>
        )}
        <MenuItem
          icon={<LogOut />}
          onSelect={async () => {
            await logout()
            navigate('/login')
          }}
        >
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
  legacy = false,
  children,
}: {
  groups: NavGroup[]
  /** Small line under the product name, e.g. "Platform admin". */
  brand?: string
  sidebarTop?: (collapsed: boolean) => ReactNode
  search: { to: string; label: string }
  settingsPath?: string
  /** Wrap the page in the older styles (screens not yet on the new design). */
  legacy?: boolean
  children: ReactNode
}) {
  const { pathname } = useLocation()
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
    <div className={cn('flex h-14 items-center gap-2.5 px-4', small && 'justify-center px-0')}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.52_0.1_178)] to-[oklch(0.34_0.07_195)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_1px_2px_rgb(15_23_32/0.2)]">
        <Building2 className="size-4" />
      </span>
      {!small && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-[-0.02em]">PG Manager</span>
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
              'sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 ease-out lg:flex print:hidden',
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
            <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/85 print:hidden px-4 backdrop-blur-md backdrop-saturate-150 md:px-8">
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
              <UserMenu settingsPath={settingsPath} />
            </header>
            <main
              id="main"
              className={cn(
                'mx-auto w-full max-w-[1360px] flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-8',
                legacy && 'legacy content',
              )}
            >
              <div key={pathname} className="animate-in">
                {children}
              </div>
            </main>
          </div>
        </div>
        <Toaster />
      </BreadcrumbProvider>
    </TooltipProvider>
  )
}
