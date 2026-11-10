/** The business app (owner, manager, accountant, caretaker). */
import {
  Activity,
  BarChart3,
  Bell,
  BellRing,
  Building2,
  ChevronsUpDown,
  Gem,
  HardHat,
  Inbox,
  IndianRupee,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Receipt,
  Rocket,
  Settings,
  Store,
  UserCog,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import { Link, Outlet } from 'react-router'

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '../components/ui-kit/menu'
import { useSession } from '../demo/session'
import { THIS_MONTH } from '../data/seed'
import { useDb } from '../data/store'
import { ShellFrame } from './ShellFrame'
import type { NavGroup, NavItem } from './ShellFrame'

type Item = NavItem & { perm?: string; ownerOnly?: boolean }

function BusinessSwitcher({ collapsed }: { collapsed: boolean }) {
  const business = useDb((db) => db.business)
  const { person } = useSession()
  if (collapsed) {
    return (
      <div className="flex justify-center border-b py-3">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          {business.logoText}
        </span>
      </div>
    )
  }
  return (
    <div className="border-b p-2">
      <Menu>
        <MenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-slate-200/60">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            {business.logoText}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{business.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{person.label}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </MenuTrigger>
        <MenuContent className="w-60">
          <MenuLabel>Your businesses</MenuLabel>
          <MenuItem>{business.name}</MenuItem>
          <MenuItem disabled>Lakshmi Ladies Hostel (as Manager)</MenuItem>
          <MenuSeparator />
          <MenuItem>Add another business</MenuItem>
        </MenuContent>
      </Menu>
    </div>
  )
}

function NotificationsButton() {
  return (
    <Link
      to="/app/notifications"
      aria-label="Notifications"
      className="relative rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
    >
      <Bell className="size-5" />
      <span className="absolute top-1 right-1 size-2 rounded-full bg-red-500 ring-2 ring-card" />
    </Link>
  )
}

export function AppShell() {
  const { can, role } = useSession()
  const openComplaints = useDb((db) => db.complaints.filter((c) => c.status === 'open').length)
  const overdue = useDb(
    (db) => db.invoices.filter((i) => i.period === THIS_MONTH && i.status === 'overdue').length,
  )
  const newEnquiries = useDb((db) => db.enquiries.filter((e) => e.status === 'new').length)

  const groups: { label: string; items: Item[] }[] = [
    {
      label: 'Overview',
      items: [
        { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/app/get-started', label: 'Get started', icon: Rocket, ownerOnly: true },
      ],
    },
    {
      label: 'Property',
      items: [
        { to: '/app/properties', label: 'Properties', icon: Building2, perm: 'properties.view' },
        { to: '/app/tenants', label: 'Tenants', icon: Users, perm: 'tenants.view' },
      ],
    },
    {
      label: 'Money',
      items: [
        {
          to: '/app/rent',
          label: 'Rent & bills',
          icon: IndianRupee,
          perm: 'rent.view',
          badge: overdue,
        },
        { to: '/app/payments', label: 'Payments & receipts', icon: Receipt, perm: 'rent.view' },
        { to: '/app/reminders', label: 'Rent reminders', icon: BellRing, perm: 'rent.view' },
        { to: '/app/expenses', label: 'Expenses', icon: Wallet, perm: 'expenses.view' },
        {
          to: '/app/reports',
          label: 'Reports & profit',
          icon: BarChart3,
          perm: 'reports.download',
        },
      ],
    },
    {
      label: 'Daily work',
      items: [
        {
          to: '/app/complaints',
          label: 'Complaints',
          icon: Wrench,
          perm: 'complaints.manage',
          badge: openComplaints,
        },
        { to: '/app/notices', label: 'Notices', icon: Megaphone, perm: 'notices.manage' },
        { to: '/app/staff', label: 'Staff & salaries', icon: HardHat, perm: 'salaries.manage' },
      ],
    },
    {
      label: 'Find tenants',
      items: [
        {
          to: '/app/enquiries',
          label: 'Enquiries',
          icon: Inbox,
          perm: 'tenants.manage',
          badge: newEnquiries,
        },
        { to: '/app/listings', label: 'Online listing', icon: Store, perm: 'properties.manage' },
      ],
    },
    {
      label: 'Business',
      items: [
        { to: '/app/team', label: 'Team & access', icon: UserCog, perm: 'team.view' },
        { to: '/app/plan', label: 'Plan & billing', icon: Gem, perm: 'plan.billing' },
        { to: '/app/activity', label: 'Activity log', icon: Activity, ownerOnly: true },
        { to: '/app/settings', label: 'Settings', icon: Settings },
        { to: '/app/help', label: 'Help & support', icon: LifeBuoy },
      ],
    },
  ]

  const visible: NavGroup[] = groups.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => (i.ownerOnly ? role === 'owner' : !i.perm || can(i.perm))),
  }))

  return (
    <ShellFrame
      groups={visible}
      sidebarTop={(collapsed) => <BusinessSwitcher collapsed={collapsed} />}
      search={{ to: '/app/tenants', label: 'Search tenants' }}
      settingsPath="/app/settings"
      headerExtra={<NotificationsButton />}
    >
      <Outlet />
    </ShellFrame>
  )
}
