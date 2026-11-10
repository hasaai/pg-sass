import {
  BellRing,
  Building2,
  ChartColumn,
  ChevronsUpDown,
  IdCard,
  Inbox,
  IndianRupee,
  LayoutDashboard,
  Gem,
  Megaphone,
  MessageSquare,
  PowerOff,
  Settings,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { EmptyState } from '../ui-kit/feedback'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '../ui-kit/menu'
import { featureOfPath, isFeatureOn } from './features'
import { initials } from '../../lib/format'
import { ShellFrame } from './ShellFrame'
import type { NavGroup, NavItem } from './ShellFrame'
import type { Permission } from '../../auth/permissions'

interface AppNavItem extends NavItem {
  perm?: Permission
  feature?: string
}

const NAV: { label: string; items: AppNavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Property management',
    items: [{ to: '/app/properties', label: 'Properties', icon: Building2 }],
  },
  {
    label: 'Tenants & rent',
    items: [
      { to: '/app/tenants', label: 'Tenants', icon: Users },
      {
        to: '/app/billing',
        label: 'Rent & payments',
        icon: IndianRupee,
        perm: 'rent.view',
        end: true,
      },
      {
        to: '/app/billing/reminders',
        label: 'Rent reminders',
        icon: BellRing,
        perm: 'rent.collect',
        feature: 'reminders',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/app/complaints', label: 'Complaints', icon: Wrench, feature: 'complaints' },
      { to: '/app/notices', label: 'Notices', icon: Megaphone, feature: 'notices' },
    ],
  },
  {
    label: 'Business',
    items: [
      {
        to: '/app/finance',
        label: 'Expenses & profit',
        icon: ChartColumn,
        perm: 'expenses.view',
        feature: 'finance',
      },
      {
        to: '/app/staff',
        label: 'Staff & salaries',
        icon: IdCard,
        perm: 'salaries.manage',
        feature: 'staff',
      },
    ],
  },
  {
    label: 'Marketplace',
    items: [
      {
        to: '/app/listings',
        label: 'Listings',
        icon: Store,
        perm: 'listings.manage',
        feature: 'marketplace',
      },
      {
        to: '/app/applications',
        label: 'Applications',
        icon: Inbox,
        perm: 'listings.manage',
        feature: 'marketplace',
      },
      {
        to: '/app/enquiries',
        label: 'Enquiries',
        icon: MessageSquare,
        perm: 'listings.manage',
        feature: 'marketplace',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/app/team', label: 'Team', icon: UserCog, perm: 'team.view' },
      {
        to: '/app/owner-verification',
        label: 'Verify identity',
        icon: ShieldCheck,
        perm: 'owner.verification',
      },
      { to: '/app/plan', label: 'Your plan', icon: Gem },
      { to: '/app/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { user, membership, switchOrganization } = useAuth()
  const navigate = useNavigate()
  const memberships = user?.memberships ?? []
  const org = membership?.organization
  const name = org?.name ?? ''
  const badge = org?.logo_url ? (
    <img src={org.logo_url} alt="" className="size-8 shrink-0 rounded-lg border object-cover" />
  ) : (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-[13px] font-semibold text-accent-foreground ring-1 ring-primary/15">
      {initials(name)}
    </span>
  )
  if (collapsed) return <div className="flex justify-center py-3">{badge}</div>
  return (
    <Menu>
      <MenuTrigger
        className="mx-2.5 mt-1 mb-1 flex items-center gap-2.5 rounded-lg border bg-card p-2 text-left shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label="Organization"
      >
        {badge}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{name}</span>
          <span className="block text-xs text-muted-foreground capitalize">{membership?.role}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <MenuLabel>Your businesses</MenuLabel>
        {memberships.map((m) => (
          <MenuItem
            key={m.organization.id}
            onSelect={() => {
              switchOrganization(m.organization.id)
              navigate('/app')
            }}
          >
            <span className="truncate">{m.organization.name}</span>
            {m.organization.id === membership?.organization.id && (
              <span className="ml-auto text-xs text-muted-foreground">Current</span>
            )}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const { can, membership } = useAuth()
  const disabled = membership?.organization.disabled_features ?? []
  const groups: NavGroup[] = NAV.map((g) => ({
    label: g.label,
    items: g.items.filter(
      (i) => (!i.perm || can(i.perm)) && (!i.feature || isFeatureOn(i.feature, disabled)),
    ),
  }))
  const blocked = featureOfPath(pathname)
  return (
    <ShellFrame
      groups={groups}
      sidebarTop={(collapsed) => <OrgSwitcher collapsed={collapsed} />}
      search={{ to: '/app/properties', label: 'Search properties' }}
      settingsPath="/app/settings"
    >
      {blocked && !isFeatureOn(blocked, disabled) ? (
        <EmptyState icon={<PowerOff />} title="Not in your plan">
          This feature is not part of your plan right now. <Link to="/app/plan">See plans</Link> to
          turn it on.
        </EmptyState>
      ) : (
        <Outlet />
      )}
    </ShellFrame>
  )
}
