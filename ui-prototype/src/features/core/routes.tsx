/** Routes of this module. `screens` feeds the "All screens" index page. */
import type { RouteObject } from 'react-router'

import { ActivityLogPage } from './ActivityPage'
import { DashboardPage } from './Dashboard'
import { GetStartedPage } from './GetStarted'
import { HelpPage } from './Help'
import { NotificationsPage } from './Notifications'
import { CheckoutPage, PlanPage } from './Plan'
import { SettingsPage } from './Settings'
import { TeamMemberPage, TeamPage } from './Team'
import { VerifyIdentityPage } from './VerifyIdentity'

export const routes: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: 'get-started', element: <GetStartedPage /> },
  { path: 'verify-identity', element: <VerifyIdentityPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'team', element: <TeamPage /> },
  { path: 'team/:id', element: <TeamMemberPage /> },
  { path: 'plan', element: <PlanPage /> },
  { path: 'plan/checkout', element: <CheckoutPage /> },
  { path: 'activity', element: <ActivityLogPage /> },
  { path: 'notifications', element: <NotificationsPage /> },
  { path: 'help', element: <HelpPage /> },
]

const group = 'Business app – basics'
export const screens: { path: string; label: string; group: string }[] = [
  { path: '/app', label: 'Dashboard', group },
  { path: '/app/get-started', label: 'Get started checklist', group },
  { path: '/app/verify-identity', label: 'Verify your identity', group },
  { path: '/app/settings', label: 'Settings', group },
  { path: '/app/team', label: 'Team & access', group },
  { path: '/app/team/m2', label: 'Team member detail', group },
  { path: '/app/plan', label: 'Plan & billing', group },
  { path: '/app/plan/checkout?plan=pro&cycle=yearly', label: 'Plan checkout', group },
  { path: '/app/activity', label: 'Activity log', group },
  { path: '/app/notifications', label: 'Notifications', group },
  { path: '/app/help', label: 'Help & support', group },
]
