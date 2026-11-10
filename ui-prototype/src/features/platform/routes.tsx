/** Routes of this module. `screens` feeds the "All screens" index page. */
import type { RouteObject } from 'react-router'

import { BusinessDetail } from './BusinessDetail'
import { Businesses } from './Businesses'
import { Overview } from './Overview'
import { Payments } from './Payments'
import { Plans } from './Plans'
import { Settings } from './Settings'
import { Sms } from './Sms'
import { Support } from './Support'
import { Team } from './Team'
import { Verification } from './Verification'
import { VerificationDetail } from './VerificationDetail'

export const routes: RouteObject[] = [
  { index: true, element: <Overview /> },
  { path: 'businesses', element: <Businesses /> },
  { path: 'businesses/:id', element: <BusinessDetail /> },
  { path: 'verification', element: <Verification /> },
  { path: 'verification/:id', element: <VerificationDetail /> },
  { path: 'plans', element: <Plans /> },
  { path: 'payments', element: <Payments /> },
  { path: 'support', element: <Support /> },
  { path: 'sms', element: <Sms /> },
  { path: 'team', element: <Team /> },
  { path: 'settings', element: <Settings /> },
]

const group = 'PG Manager team'
export const screens: { path: string; label: string; group: string }[] = [
  { path: '/platform', label: 'Overview', group },
  { path: '/platform/businesses', label: 'Businesses', group },
  { path: '/platform/businesses/b1', label: 'Business details (Asha Stays)', group },
  { path: '/platform/businesses/b13', label: 'Business details (suspended)', group },
  { path: '/platform/verification', label: 'Owner and property checks', group },
  { path: '/platform/verification/v4', label: 'Check an owner ID', group },
  { path: '/platform/verification/v1', label: 'Check a property', group },
  { path: '/platform/plans', label: 'Plans', group },
  { path: '/platform/payments', label: 'Plan payments', group },
  { path: '/platform/support', label: 'Support tickets', group },
  { path: '/platform/support?ticket=st3', label: 'Support ticket conversation', group },
  { path: '/platform/sms', label: 'SMS gateways', group },
  { path: '/platform/team', label: 'Platform team', group },
  { path: '/platform/settings', label: 'Platform settings', group },
]
