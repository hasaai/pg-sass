/** Routes of the operations module (daily work, money & reports, finding tenants). */
import type { RouteObject } from 'react-router'

import { ComplaintDetailPage } from './complaint-detail'
import { ComplaintsPage } from './complaints'
import { EnquiriesPage } from './enquiries'
import { ExpensesPage } from './expenses'
import { ListingsPage } from './listings'
import { NoticesPage } from './notices'
import { ReportsPage } from './reports'
import { StaffPage } from './staff'
import { StaffDetailPage } from './staff-detail'

export const routes: RouteObject[] = [
  { path: 'complaints', element: <ComplaintsPage /> },
  { path: 'complaints/:id', element: <ComplaintDetailPage /> },
  { path: 'notices', element: <NoticesPage /> },
  { path: 'expenses', element: <ExpensesPage /> },
  { path: 'reports', element: <ReportsPage /> },
  { path: 'staff', element: <StaffPage /> },
  { path: 'staff/:id', element: <StaffDetailPage /> },
  { path: 'enquiries', element: <EnquiriesPage /> },
  { path: 'listings', element: <ListingsPage /> },
]

export const screens: { path: string; label: string; group: string }[] = [
  { path: '/app/complaints', label: 'Complaints (board & list)', group: 'Daily work' },
  { path: '/app/complaints/c2', label: 'Complaint detail', group: 'Daily work' },
  { path: '/app/notices', label: 'Notices', group: 'Daily work' },
  { path: '/app/staff', label: 'Staff & salaries', group: 'Daily work' },
  { path: '/app/staff/s1', label: 'Staff profile', group: 'Daily work' },
  { path: '/app/expenses', label: 'Expenses', group: 'Money & reports' },
  { path: '/app/reports', label: 'Reports & profit', group: 'Money & reports' },
  { path: '/app/enquiries', label: 'Enquiries', group: 'Find tenants' },
  { path: '/app/listings', label: 'Online listing', group: 'Find tenants' },
]
