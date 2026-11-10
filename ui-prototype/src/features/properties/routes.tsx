/** Routes of this module. `screens` feeds the "All screens" index page. */
import type { RouteObject } from 'react-router'

import { PropertiesList } from './PropertiesList'
import { PropertyDetail } from './PropertyDetail'
import { PropertyWizard } from './PropertyWizard'

export const routes: RouteObject[] = [
  { path: 'properties', element: <PropertiesList /> },
  { path: 'properties/new', element: <PropertyWizard /> },
  { path: 'properties/:id', element: <PropertyDetail /> },
  { path: 'properties/:id/edit', element: <PropertyWizard key="edit" /> },
]

const G = 'Properties, rooms & beds'
export const screens: { path: string; label: string; group: string }[] = [
  { path: '/app/properties', label: 'Properties list', group: G },
  { path: '/app/properties/new', label: 'Add a property (step by step)', group: G },
  { path: '/app/properties/p1', label: 'Property page – overview', group: G },
  { path: '/app/properties/p1?tab=rooms', label: 'Rooms & beds', group: G },
  {
    path: '/app/properties/p3?tab=rooms',
    label: 'Rooms & beds – new property (few rooms)',
    group: G,
  },
  { path: '/app/properties/p3', label: 'Not finished property (setup checklist)', group: G },
  { path: '/app/properties/p1?tab=tenants', label: 'Property tenants', group: G },
  { path: '/app/properties/p1?tab=amenities', label: 'Property amenities', group: G },
  { path: '/app/properties/p1?tab=photos', label: 'Property photos', group: G },
  {
    path: '/app/properties/p2?tab=documents',
    label: 'Property documents (expired licence)',
    group: G,
  },
  {
    path: '/app/properties/p2?tab=verification',
    label: 'Property verification (being checked)',
    group: G,
  },
  {
    path: '/app/properties/p3?tab=verification',
    label: 'Property verification (not sent)',
    group: G,
  },
  { path: '/app/properties/p1?tab=settings', label: 'Property settings', group: G },
  { path: '/app/properties/p1/edit', label: 'Edit property details', group: G },
]
