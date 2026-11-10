/** The PG Manager team's own admin area (all businesses). */
import {
  Building,
  CreditCard,
  Gem,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareText,
  Settings2,
  ShieldCheck,
  UserCog,
} from 'lucide-react'
import { Outlet } from 'react-router'

import { useDb } from '../data/store'
import { ShellFrame } from './ShellFrame'

export function PlatformShell() {
  const waiting = useDb(
    (db) =>
      db.verificationQueue.filter((v) => v.status === 'submitted' || v.status === 'under_review')
        .length,
  )
  const tickets = useDb((db) => db.supportTickets.filter((t) => t.status === 'open').length)
  return (
    <ShellFrame
      brand="Platform admin"
      search={{ to: '/platform/businesses', label: 'Search businesses' }}
      settingsPath="/platform/settings"
      groups={[
        {
          label: 'Overview',
          items: [{ to: '/platform', label: 'Overview', icon: LayoutDashboard, end: true }],
        },
        {
          label: 'Customers',
          items: [
            { to: '/platform/businesses', label: 'Businesses', icon: Building },
            { to: '/platform/verification', label: 'Checks', icon: ShieldCheck, badge: waiting },
            { to: '/platform/support', label: 'Support', icon: LifeBuoy, badge: tickets },
          ],
        },
        {
          label: 'Money',
          items: [
            { to: '/platform/plans', label: 'Plans', icon: Gem },
            { to: '/platform/payments', label: 'Payments', icon: CreditCard },
          ],
        },
        {
          label: 'System',
          items: [
            { to: '/platform/sms', label: 'SMS gateways', icon: MessageSquareText },
            { to: '/platform/team', label: 'Platform team', icon: UserCog },
            { to: '/platform/settings', label: 'Settings', icon: Settings2 },
          ],
        },
      ]}
    >
      <Outlet />
    </ShellFrame>
  )
}
