import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'

import { createQueryClient } from '../api/queryClient'
import { AuthProvider } from '../auth/AuthContext'

export type Route = (
  url: string,
  init: RequestInit,
) => { status: number; body?: unknown } | undefined

/** Stub fetch with a small router: return { status, body } for matching URLs. */
export function mockApi(route: Route) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const hit = route(url, init) ?? {
      status: 404,
      body: { error: { code: 'not_found', message: 'Not found.', fields: {} } },
    }
    return new Response(hit.body === undefined ? null : JSON.stringify(hit.body), {
      status: hit.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function renderApp(ui: ReactElement, path = '/') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export const ME = {
  id: 'u1',
  email: 'asha@example.com',
  phone: '9845012345',
  phone_verified: true,
  email_verified: true,
  full_name: 'Asha Rao',
  memberships: [{ role: 'owner', organization: { id: 'o1', name: 'Asha PG', slug: 'asha-pg' } }],
}

export const STAFF_ME = {
  ...ME,
  memberships: [
    {
      ...ME.memberships[0]!,
      role: 'staff',
      role_label: 'Caretaker',
      permissions: ['complaints.manage', 'dashboard.view', 'properties.view', 'tenants.view'],
      all_properties: true,
    },
  ],
}

/** Every PG Manager team permission (a Platform owner). */
export const PLATFORM_OWNER_PERMISSIONS = [
  'p.activity.view',
  'p.business_data.edit',
  'p.business_data.view',
  'p.businesses.features',
  'p.businesses.suspend',
  'p.businesses.view',
  'p.catalog.manage',
  'p.documents.download',
  'p.gateways.manage',
  'p.overview.view',
  'p.payments.view',
  'p.plans.manage',
  'p.sms.manage',
  'p.staff.manage',
  'p.subscriptions.assign',
  'p.users.deactivate',
  'p.users.help',
  'p.users.view',
  'p.verification.review',
]

export const PLATFORM_ME = {
  ...ME,
  is_platform_admin: true,
  platform_role_label: 'Platform owner',
  platform_permissions: PLATFORM_OWNER_PERMISSIONS,
  memberships: [],
}
