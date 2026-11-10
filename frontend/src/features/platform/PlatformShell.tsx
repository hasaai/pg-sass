import {
  Activity,
  Building2,
  CreditCard,
  Gem,
  LayoutDashboard,
  MessageSquareText,
  ListChecks,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
} from 'lucide-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'

import { useAuth } from '../../auth/AuthContext'
import { ShellFrame } from '../../components/shell/ShellFrame'
import type { NavGroup, NavItem } from '../../components/shell/ShellFrame'
import type { PlatformPermission } from '../../auth/permissions'
import { Button } from '../../components/ui-kit/button'
import { EmptyState } from '../../components/ui-kit/feedback'
import { Tooltip } from '../../components/ui-kit/tooltip'
import { cn } from '../../lib/cn'

type PlatformNavItem = NavItem & { perm: PlatformPermission | readonly PlatformPermission[] }

const NAV: { label: string; items: PlatformNavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      {
        to: '/platform',
        label: 'Overview',
        icon: LayoutDashboard,
        end: true,
        perm: 'p.overview.view',
      },
    ],
  },
  {
    label: 'Businesses',
    items: [
      {
        to: '/platform/businesses',
        label: 'Businesses',
        icon: Building2,
        perm: 'p.businesses.view',
      },
      { to: '/platform/plans', label: 'Plans', icon: Gem, perm: 'p.plans.manage' },
      {
        to: '/platform/payments',
        label: 'Plan payments',
        icon: CreditCard,
        perm: ['p.payments.view', 'p.gateways.manage'],
      },
      {
        to: '/platform/verification',
        label: 'Verification queue',
        icon: ShieldCheck,
        perm: 'p.verification.review',
      },
      {
        to: '/platform/properties',
        label: 'All properties',
        icon: ListChecks,
        perm: ['p.businesses.view', 'p.verification.review'],
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/platform/users', label: 'Users', icon: Users, perm: 'p.users.view' },
      { to: '/platform/staff', label: 'Platform staff', icon: UserCog, perm: 'p.staff.manage' },
      {
        to: '/platform/amenities',
        label: 'Amenity catalog',
        icon: Sparkles,
        perm: 'p.catalog.manage',
      },
      { to: '/platform/sms', label: 'SMS gateways', icon: MessageSquareText, perm: 'p.sms.manage' },
      { to: '/platform/activity', label: 'Activity', icon: Activity, perm: 'p.activity.view' },
    ],
  },
]

/** The PG Manager team's portal. Platform staff only (the API checks too). */
export function PlatformShell() {
  const { status, user, canPlatform } = useAuth()
  const location = useLocation()
  if (status === 'loading') return null
  if (status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!user?.is_platform_admin)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <EmptyState
          icon={<ShieldCheck />}
          title="Platform team only"
          className="w-full max-w-lg border-solid shadow-xs"
          actions={
            <Button variant="outline" asChild>
              <Link to="/app">Go to your business</Link>
            </Button>
          }
        >
          This area is for the PG Manager platform team.
        </EmptyState>
      </div>
    )
  const groups: NavGroup[] = NAV.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => canPlatform(i.perm)),
  })).filter((g) => g.items.length > 0)
  return (
    <ShellFrame
      groups={groups}
      brand="Platform admin"
      sidebarTop={(collapsed) => (
        <RoleChip label={user.platform_role_label} collapsed={collapsed} />
      )}
      search={{ to: '/platform/businesses', label: 'Search businesses' }}
    >
      <Outlet />
    </ShellFrame>
  )
}

/** "Platform owner" under the logo, so team members always see which role they work in. */
function RoleChip({ label, collapsed }: { label?: string | null; collapsed: boolean }) {
  if (!label) return null
  const chip = (
    <div
      className={cn(
        'mx-2.5 mb-1 flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 shadow-xs',
        collapsed && 'mx-auto size-9 justify-center p-0',
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary-soft text-accent-foreground">
        <ShieldCheck className="size-3" />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block text-[11px] text-muted-foreground">Your role</span>
          <span className="block truncate text-[12.5px] font-medium">{label}</span>
        </span>
      )}
    </div>
  )
  return collapsed ? (
    <Tooltip content={`Your role: ${label}`} side="right">
      {chip}
    </Tooltip>
  ) : (
    chip
  )
}
