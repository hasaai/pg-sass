import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '../../api/queryClient'
import { AuthProvider } from '../../auth/AuthContext'
import { RequirePlatformPermission } from '../../auth/guards'
import { makePlatformCan } from '../../auth/permissions'
import { PLATFORM_ME, mockApi } from '../../test/render'
import { PlatformShell } from './PlatformShell'
import { PlatformStaffPage } from './StaffPage'

afterEach(() => vi.unstubAllGlobals())

const FINANCE_ME = {
  ...PLATFORM_ME,
  platform_role_label: 'Finance admin',
  platform_permissions: [
    'p.activity.view',
    'p.businesses.view',
    'p.gateways.manage',
    'p.overview.view',
    'p.payments.view',
    'p.plans.manage',
    'p.subscriptions.assign',
  ],
}

const SUPPORT_TICKS = ['p.activity.view', 'p.businesses.view', 'p.overview.view', 'p.users.view']
const CHOICES = {
  roles: [
    { value: 'platform_owner', label: 'Platform owner', help: 'Everything.', permissions: [] },
    { value: 'support_agent', label: 'Support agent', help: 'Helps.', permissions: SUPPORT_TICKS },
  ],
  permissions: [
    { code: 'p.overview.view', area: 'Overview', label: 'Platform overview and counts' },
    { code: 'p.businesses.view', area: 'Businesses', label: 'Business list and details' },
    { code: 'p.payments.view', area: 'Money', label: 'Plan payments list' },
    { code: 'p.users.view', area: 'Support', label: 'Search people' },
    { code: 'p.activity.view', area: 'Support', label: 'Activity log' },
  ],
}
const SURESH = {
  id: 's2',
  user: { id: 'u2', full_name: 'Suresh', email: 'support@example.com' },
  role: 'support_agent',
  role_label: 'Support agent',
  permissions: SUPPORT_TICKS,
  extra_permissions: [],
  removed_permissions: [],
  is_active: true,
  created_at: '2026-10-01T00:00:00Z',
}

function setup(me: unknown, path: string) {
  const fetchMock = mockApi((url) => {
    if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
    if (url.endsWith('/auth/me')) return { status: 200, body: me }
    if (url.includes('/platform/staff/access-choices/')) return { status: 200, body: CHOICES }
    if (url.includes('/platform/staff/history/')) return { status: 200, body: [] }
    if (url.includes('/platform/staff/s2/')) return { status: 200, body: SURESH }
    if (url.includes('/platform/staff/')) return { status: 200, body: [SURESH] }
    return { status: 200, body: [] }
  })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/platform" element={<PlatformShell />}>
              <Route index element={<p>Overview page</p>} />
              <Route element={<RequirePlatformPermission perm="p.staff.manage" />}>
                <Route path="staff" element={<PlatformStaffPage />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return fetchMock
}

describe('platform roles', () => {
  it('checks any of several permissions', () => {
    const can = makePlatformCan({ platform_permissions: ['p.payments.view'] })
    expect(can('p.payments.view')).toBe(true)
    expect(can(['p.users.view', 'p.payments.view'])).toBe(true)
    expect(can('p.staff.manage')).toBe(false)
    expect(makePlatformCan(null)('p.overview.view')).toBe(false)
  })

  it('a finance admin sees only their pages', async () => {
    setup(FINANCE_ME, '/platform/staff')
    expect(await screen.findByText('Not part of your role')).toBeInTheDocument()
    const nav = screen.getAllByRole('navigation')[0]!
    expect(within(nav).getByText('Plan payments')).toBeInTheDocument()
    expect(within(nav).queryByText('Users')).not.toBeInTheDocument()
    expect(within(nav).queryByText('SMS gateways')).not.toBeInTheDocument()
  })

  it('the Platform owner changes a support agent’s ticks', async () => {
    const fetchMock = setup(PLATFORM_ME, '/platform/staff')
    const row = (await screen.findByText('Suresh')).closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: /Change access/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Plan payments list' }))
    expect(within(dialog).getByText('Added')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save access' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH'),
      ).toBe(true),
    )
    const patch = fetchMock.mock.calls.find(
      ([, i]) => (i as RequestInit | undefined)?.method === 'PATCH',
    )!
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({
      role: 'support_agent',
      permissions: [...SUPPORT_TICKS, 'p.payments.view'].sort(),
    })
  })
})
