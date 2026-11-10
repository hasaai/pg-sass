import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ME, STAFF_ME, mockApi, renderApp } from '../../test/render'
import type { Route as ApiRoute } from '../../test/render'
import { ageFrom, deductionsTotal, tenantStatus } from './labels'
import { TenantDetailPage } from './TenantDetailPage'
import { TenantsListPage } from './TenantsListPage'

afterEach(() => vi.unstubAllGlobals())

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results })

const STAY = {
  id: 's1',
  status: 'active',
  status_label: 'Active',
  check_in: '2026-10-01',
  expected_checkout: null,
  monthly_rent: 900000,
  bed: null,
  place: {
    kind: 'room',
    kind_label: 'Whole room',
    label: 'Room 201 · Whole room',
    property_id: 'p1',
    property_name: 'Lotus PG',
    bed_id: null,
    room_id: 'r1',
    unit_id: null,
  },
}

const TENANT = {
  id: 't1',
  full_name: 'Meera N',
  phone: '9845012345',
  email: '',
  gender: 'female',
  gender_label: 'Female',
  occupation: 'Designer',
  date_of_birth: '2000-05-01',
  home_address: 'Mysuru',
  id_type: 'aadhaar',
  id_type_label: 'Aadhaar',
  id_last4: '4321',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  notes: '',
  consent_given_at: '2026-10-01T10:00:00Z',
  current_stay: STAY,
  moved_out_on: null,
  created_at: '2026-10-01T10:00:00Z',
}

const FULL_STAY = {
  ...STAY,
  tenant: { id: 't1', full_name: 'Meera N', phone: '9845012345' },
  notice_date: null,
  check_out: null,
  deposit_amount: 1800000,
  deposit_held: 1800000,
  deposit_transactions: [
    { id: 'd1', kind: 'collected', amount: 1800000, date: '2026-10-01', note: '', created_at: '' },
  ],
  notice_period_days: 30,
  lock_in_months: 0,
  agreement_end: null,
  has_agreement_file: false,
  created_at: '2026-10-01T10:00:00Z',
}

function api(me: unknown, extra: ApiRoute) {
  return mockApi((url, init) => {
    if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
    if (url.endsWith('/auth/me')) return { status: 200, body: me }
    if (url.startsWith('/api/v1/properties/'))
      return { status: 200, body: page([{ id: 'p1', name: 'Lotus PG' }]) }
    return extra(url, init) ?? { status: 200, body: page([]) }
  })
}

const bodyOf = (call: unknown[] | undefined) =>
  JSON.parse(String((call?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>

describe('tenant words', () => {
  it('describes where a tenant is', () => {
    expect(tenantStatus({ current_stay: null, moved_out_on: null }).label).toBe('Not checked in')
    expect(tenantStatus({ current_stay: null, moved_out_on: '2026-09-01' }).label).toBe('Moved out')
    expect(tenantStatus({ current_stay: STAY as never, moved_out_on: null }).label).toBe('Staying')
    expect(
      tenantStatus({ current_stay: { ...STAY, status: 'notice' } as never, moved_out_on: null })
        .label,
    ).toBe('Leaving soon')
  })

  it('works out age and deductions', () => {
    expect(ageFrom('2000-10-19', new Date(2026, 9, 18))).toBe(25)
    expect(ageFrom('2000-10-18', new Date(2026, 9, 18))).toBe(26)
    expect(
      deductionsTotal([
        { reason: 'Chair', amount: '1,500' },
        { reason: '', amount: '' },
      ]),
    ).toBe(150000)
    expect(Number.isNaN(deductionsTotal([{ reason: 'x', amount: 'abc' }]))).toBe(true)
  })
})

describe('tenant list', () => {
  it('shows tenants with where they stay and filters by status', async () => {
    const fetchMock = api(ME, (url) => {
      if (url.startsWith('/api/v1/tenants/summary/'))
        return { status: 200, body: { all: 3, active: 1, notice: 1, past: 0, never: 1 } }
      if (url.startsWith('/api/v1/tenants/')) return { status: 200, body: page([TENANT]) }
      return undefined
    })
    const user = userEvent.setup()
    renderApp(
      <Routes>
        <Route path="/app/tenants" element={<TenantsListPage />} />
      </Routes>,
      '/app/tenants',
    )
    expect(await screen.findByRole('link', { name: 'Meera N' })).toBeInTheDocument()
    expect(screen.getAllByText('Room 201 · Whole room').length).toBeGreaterThan(0)
    expect(await screen.findByRole('tab', { name: 'Leaving soon 1' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Leaving soon/ }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u]) => String(u).startsWith('/api/v1/tenants/?') && String(u).includes('status=notice'),
        ),
      ).toBe(true),
    )
  })

  it('adds a tenant and checks them in to a whole room on one screen', async () => {
    const fetchMock = api(ME, (url, init) => {
      if (url.startsWith('/api/v1/tenants/summary/'))
        return { status: 200, body: { all: 0, active: 0, notice: 0, past: 0, never: 0 } }
      if (url === '/api/v1/tenants/' && init.method === 'POST')
        return { status: 201, body: { ...TENANT, current_stay: null } }
      if (url.startsWith('/api/v1/stays/free-places/'))
        return {
          status: 200,
          body: [
            {
              kind: 'room',
              id: 'r1',
              label: 'Room 201',
              detail: 'Private room · AC',
              monthly_rent: 1500000,
              deposit: null,
              reserved: false,
            },
          ],
        }
      if (url === '/api/v1/stays/' && init.method === 'POST')
        return { status: 201, body: FULL_STAY }
      if (url.startsWith('/api/v1/tenants/')) return { status: 200, body: page([]) }
      return undefined
    })
    const user = userEvent.setup()
    renderApp(
      <Routes>
        <Route path="/app/tenants" element={<TenantsListPage />} />
        <Route path="/app/tenants/:id" element={<p>tenant page</p>} />
      </Routes>,
      '/app/tenants',
    )
    await user.click((await screen.findAllByRole('button', { name: /Add tenant/ }))[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Add tenant' })
    const d = within(dialog)
    await user.type(d.getByLabelText(/Full name/), 'Meera N')
    await user.type(d.getByLabelText(/^Mobile/), '98450 12345')
    await user.click(screen.getByRole('button', { name: 'Add tenant' }))
    expect(await d.findByText(/must agree/)).toBeInTheDocument()
    await user.click(d.getByRole('checkbox', { name: /The tenant agrees/ }))
    await user.click(d.getByRole('checkbox', { name: /Check in now/ }))
    await user.click(screen.getByRole('button', { name: 'Add and check in' }))
    expect(await d.findByText(/Choose where the tenant will stay/)).toBeInTheDocument()
    await user.selectOptions(d.getByLabelText(/Property/), 'p1')
    await user.click(await d.findByRole('radio', { name: /Room 201/ }))
    await user.type(d.getByLabelText(/Security deposit/), '30000')
    await user.click(screen.getByRole('button', { name: 'Add and check in' }))
    expect(await screen.findByText('tenant page')).toBeInTheDocument()
    const stayPost = fetchMock.mock.calls.find(
      ([u, i]) => u === '/api/v1/stays/' && i?.method === 'POST',
    )
    expect(bodyOf(stayPost)).toMatchObject({
      tenant: 't1',
      room: 'r1',
      deposit_amount: 3000000,
      deposit_collected: 0,
    })
    expect(bodyOf(stayPost)).not.toHaveProperty('monthly_rent') // the room's rent is used
    expect(
      bodyOf(
        fetchMock.mock.calls.find(([u, i]) => u === '/api/v1/tenants/' && i?.method === 'POST'),
      ),
    ).toMatchObject({ full_name: 'Meera N', consent: true })
  })

  it('staff do not see the add button', async () => {
    api(STAFF_ME, (url) =>
      url.startsWith('/api/v1/tenants/summary/')
        ? { status: 200, body: { all: 0, active: 0, notice: 0, past: 0, never: 0 } }
        : undefined,
    )
    renderApp(
      <Routes>
        <Route path="/app/tenants" element={<TenantsListPage />} />
      </Routes>,
      '/app/tenants',
    )
    expect(await screen.findByText('No tenants yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add tenant/ })).toBeNull()
  })
})

describe('tenant page', () => {
  it('shows the current stay and checks out with a deduction', async () => {
    const fetchMock = api(ME, (url, init) => {
      if (url === '/api/v1/tenants/t1/') return { status: 200, body: TENANT }
      if (url.startsWith('/api/v1/stays/?')) return { status: 200, body: page([FULL_STAY]) }
      if (url === '/api/v1/stays/s1/checkout/' && init.method === 'POST')
        return { status: 200, body: { ...FULL_STAY, status: 'closed' } }
      return undefined
    })
    const user = userEvent.setup()
    renderApp(
      <Routes>
        <Route path="/app/tenants/:id" element={<TenantDetailPage />} />
      </Routes>,
      '/app/tenants/t1',
    )
    expect(await screen.findByRole('heading', { name: /Meera N/ })).toBeInTheDocument()
    expect(await screen.findByText('Current stay')).toBeInTheDocument()
    expect(screen.getByText('₹18,000 of ₹18,000 paid')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Check out' }))
    const dialog = await screen.findByRole('dialog', { name: 'Check out Meera N' })
    const d = within(dialog)
    await user.click(d.getByRole('button', { name: /Add/ }))
    await user.type(d.getByLabelText('Reason'), 'Broken chair')
    await user.type(d.getByLabelText('Amount (₹)'), '2000')
    expect(d.getByText('₹16,000')).toBeInTheDocument() // given back
    await user.click(d.getByRole('button', { name: 'Check out' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => u === '/api/v1/stays/s1/checkout/')).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([u]) => u === '/api/v1/stays/s1/checkout/')
    expect(bodyOf(call)).toMatchObject({ deductions: [{ reason: 'Broken chair', amount: 200000 }] })
  })
})
