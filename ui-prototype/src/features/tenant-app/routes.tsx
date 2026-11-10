/** Routes of this module. `screens` feeds the "All screens" index page. */
import type { RouteObject } from 'react-router'

import { ComplaintDetail, ComplaintList, NewComplaint } from './Complaints'
import { FoodMenu } from './Food'
import { Home } from './Home'
import { Notices } from './Notices'
import { AppSettings, GiveNotice, Profile } from './Profile'
import { BillDetail, PayRent, RentList } from './Rent'

export const routes: RouteObject[] = [
  { index: true, element: <Home /> },
  { path: 'rent', element: <RentList /> },
  { path: 'rent/pay', element: <PayRent /> },
  { path: 'rent/:invoiceId', element: <BillDetail /> },
  { path: 'complaints', element: <ComplaintList /> },
  { path: 'complaints/new', element: <NewComplaint /> },
  { path: 'complaints/:id', element: <ComplaintDetail /> },
  { path: 'notices', element: <Notices /> },
  { path: 'food', element: <FoodMenu /> },
  { path: 'profile', element: <Profile /> },
  { path: 'profile/notice', element: <GiveNotice /> },
  { path: 'profile/settings', element: <AppSettings /> },
]

const group = 'Tenant app'
export const screens: { path: string; label: string; group: string }[] = [
  { path: '/tenant', label: 'Home', group },
  { path: '/tenant/rent', label: 'Rent bills', group },
  { path: '/tenant/rent/inv3', label: 'Bill details (paid)', group },
  { path: '/tenant/rent/pay', label: 'Pay rent by UPI', group },
  { path: '/tenant/complaints', label: 'My complaints', group },
  { path: '/tenant/complaints/new', label: 'Raise a complaint', group },
  { path: '/tenant/notices', label: 'Notices', group },
  { path: '/tenant/food', label: 'Food menu', group },
  { path: '/tenant/profile', label: 'My profile', group },
  { path: '/tenant/profile/notice', label: 'Give notice to move out', group },
  { path: '/tenant/profile/settings', label: 'App settings', group },
]
