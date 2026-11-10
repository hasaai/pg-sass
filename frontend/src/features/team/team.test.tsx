import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeCan } from '../../auth/permissions'
import { ME, STAFF_ME, mockApi, renderApp } from '../../test/render'
import { accessSummary, groupByArea, propertiesSummary, tickChanges } from './access'
import { TeamPage } from './TeamPage'

afterEach(() => vi.unstubAllGlobals())

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results })

const STAFF_TICKS = ['complaints.manage', 'dashboard.view', 'properties.view', 'tenants.view']
const CHOICES = {
  roles: [
    {
      value: 'owner',
      label: 'Owner',
      help: 'Everything.',
      permissions: [...STAFF_TICKS, 'rent.view'],
    },
    { value: 'staff', label: 'Caretaker', help: 'No money.', permissions: STAFF_TICKS },
  ],
  permissions: [
    { code: 'dashboard.view', area: 'Dashboard', label: 'See the dashboard' },
    { code: 'properties.view', area: 'Properties', label: 'See properties' },
    { code: 'tenants.view', area: 'Tenants', label: 'See tenants' },
    { code: 'rent.view', area: 'Rent', label: 'See bills, payments and dues' },
    { code: 'complaints.manage', area: 'Operations', label: 'See and handle complaints' },
  ],
}
const RAJU = {
  id: 'm2',
  user: { id: 'u2', email: 'raju@example.com', full_name: 'Raju' },
  role: 'staff',
  role_label: 'Caretaker',
  is_active: true,
  permissions: STAFF_TICKS,
  extra_permissions: [],
  removed_permissions: [],
  property_ids: [],
  created_at: '2026-10-01T00:00:00Z',
}
const OWNER = {
  ...RAJU,
  id: 'm1',
  user: { id: 'u1', email: 'asha@example.com', full_name: 'Asha Rao' },
  role: 'owner',
  role_label: 'Owner',
}

function setup(me: unknown = ME) {
  return mockApi((url) => {
    if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
    if (url.endsWith('/auth/me')) return { status: 200, body: me }
    if (url.includes('/members/access-choices/')) return { status: 200, body: CHOICES }
    if (url.includes('/members/m2/')) return { status: 200, body: RAJU }
    if (url.includes('/members/')) return { status: 200, body: page([OWNER, RAJU]) }
    if (url.includes('/properties/'))
      return {
        status: 200,
        body: page([
          { id: 'p1', name: 'Koramangala PG' },
          { id: 'p2', name: 'HSR PG' },
        ]),
      }
    return undefined
  })
}

describe('access helpers', () => {
  it('compares ticks with the role and summarises', () => {
    expect(tickChanges(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] })
    expect(accessSummary([], [])).toBe('Same as role')
    expect(accessSummary(['x'], ['y', 'z'])).toBe('1 added, 2 removed')
    const names = new Map([['p1', 'Koramangala PG']])
    expect(propertiesSummary([], names)).toBe('All properties')
    expect(propertiesSummary(['p1', 'p2', 'p3'], names)).toBe('Koramangala PG + 2 more')
    expect(groupByArea(CHOICES.permissions).map((g) => g.area)).toEqual([
      'Dashboard',
      'Properties',
      'Tenants',
      'Rent',
      'Operations',
    ])
  })

  it('owner can do everything, others only their list', () => {
    expect(makeCan({ role: 'owner', permissions: [] })('rent.view')).toBe(true)
    const staff = makeCan({ role: 'staff', permissions: ['tenants.view'] })
    expect(staff('tenants.view')).toBe(true)
    expect(staff('rent.view')).toBe(false)
    expect(makeCan(null)('dashboard.view')).toBe(false)
  })
})

describe('Team screen', () => {
  it('changes ticks and properties for a caretaker', async () => {
    const fetchMock = setup()
    renderApp(<TeamPage />)
    const row = (await screen.findByText('Raju')).closest('tr')!
    expect(within(row).getByText('Caretaker')).toBeInTheDocument()
    expect(within(row).getByText('All properties')).toBeInTheDocument()

    await userEvent.click(within(row).getByRole('button', { name: /Change access/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'See bills, payments and dues' }),
    )
    expect(within(dialog).getByText('Added')).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'All properties (also new ones)' }),
    )
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Works in HSR PG' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save access' }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH'),
      ).toBe(true),
    )
    const patch = fetchMock.mock.calls.find(
      ([, i]) => (i as RequestInit | undefined)?.method === 'PATCH',
    )!
    expect(String(patch[0])).toContain('/members/m2/')
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({
      role: 'staff',
      permissions: [...STAFF_TICKS, 'rent.view'].sort(),
      property_ids: ['p1', 'p2'],
    })
  })

  it('people who can only see the team get no buttons', async () => {
    setup({
      ...STAFF_ME,
      memberships: [
        {
          ...STAFF_ME.memberships[0]!,
          permissions: [...STAFF_ME.memberships[0]!.permissions, 'team.view'],
        },
      ],
    })
    renderApp(<TeamPage />)
    expect(await screen.findByText('Raju')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add person/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Change access/ })).not.toBeInTheDocument()
  })
})
