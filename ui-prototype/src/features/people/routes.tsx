/** Routes of this module. `screens` feeds the "All screens" index page. */
import type { RouteObject } from 'react-router'

import { DepositsPage } from './Deposits'
import { InvoiceDetail } from './InvoiceDetail'
import { PaymentsPage } from './Payments'
import { RemindersPage } from './Reminders'
import { RentList } from './RentList'
import { TenantNew } from './TenantNew'
import { TenantProfile } from './TenantProfile'
import { TenantsList } from './TenantsList'

export const routes: RouteObject[] = [
  { path: 'tenants', element: <TenantsList /> },
  { path: 'tenants/new', element: <TenantNew /> },
  { path: 'tenants/:id', element: <TenantProfile /> },
  { path: 'rent', element: <RentList /> },
  { path: 'rent/:invoiceId', element: <InvoiceDetail /> },
  { path: 'payments', element: <PaymentsPage /> },
  { path: 'reminders', element: <RemindersPage /> },
  { path: 'deposits', element: <DepositsPage /> },
]

export const screens: { path: string; label: string; group: string }[] = [
  { path: '/app/tenants', label: 'Tenants list', group: 'Tenants' },
  { path: '/app/tenants/new', label: 'Check in a tenant (wizard)', group: 'Tenants' },
  { path: '/app/tenants/t1', label: 'Tenant profile', group: 'Tenants' },
  { path: '/app/tenants/t3', label: 'Tenant on notice', group: 'Tenants' },
  { path: '/app/rent', label: 'Rent & bills', group: 'Rent & payments' },
  { path: '/app/rent?status=overdue', label: 'Overdue bills', group: 'Rent & payments' },
  { path: '/app/rent/inv4', label: 'Bill (invoice)', group: 'Rent & payments' },
  { path: '/app/payments', label: 'Payments & receipts', group: 'Rent & payments' },
  { path: '/app/reminders', label: 'Rent reminders', group: 'Rent & payments' },
  { path: '/app/deposits', label: 'Deposits', group: 'Rent & payments' },
]
