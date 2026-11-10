import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'

import { AppRoutes } from './App'
import { ME, STAFF_ME, mockApi, renderApp } from './test/render'

const EMPTY_PAGE = { next: null, previous: null, results: [] }
const DASHBOARD = {
  period: '2026-10',
  beds: { vacant: 3, reserved: 0, occupied: 1, blocked: 0, total: 4 },
  occupancy_rate: 25,
  tenants: { current: 1, on_notice: 0, checked_in_this_period: 1 },
  upcoming_checkouts: [],
  complaints: { open: 2, high_priority_open: 1 },
  money: {
    invoiced: 900000,
    collected: 400000,
    outstanding: 500000,
    overdue: 0,
    overdue_invoices: 0,
  },
  enquiries: { new: 3 },
}

afterEach(() => vi.unstubAllGlobals())

describe('authentication', () => {
  it('sends anonymous visitors from the app to the login page', async () => {
    mockApi((url) => (url.endsWith('/auth/refresh') ? { status: 401, body: {} } : undefined))
    renderApp(<AppRoutes />, '/app/tenants')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('logs in and opens the dashboard', async () => {
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/auth/refresh')) return { status: 401, body: {} }
      if (url.endsWith('/auth/login')) {
        const body = JSON.parse(String(init.body))
        return body.password === 'right-password'
          ? { status: 200, body: { access: 'tok', user: ME } }
          : {
              status: 401,
              body: {
                error: {
                  code: 'invalid_credentials',
                  message: 'Email or password is incorrect.',
                  fields: {},
                },
              },
            }
      }
      if (url.startsWith('/api/v1/reports/dashboard')) return { status: 200, body: DASHBOARD }
      if (url.startsWith('/api/v1/properties/')) return { status: 200, body: EMPTY_PAGE }
      return undefined
    })
    const user = userEvent.setup()
    renderApp(<AppRoutes />, '/login')
    await user.click(await screen.findByRole('tab', { name: 'Email and password' }))
    await user.type(await screen.findByLabelText('Email'), 'asha@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'right-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(await screen.findByText('25%')).toBeInTheDocument()
    expect(screen.getByText('₹4,000')).toBeInTheDocument()
    const dashboardCall = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/reports/dashboard'),
    )
    expect(
      (dashboardCall![1] as RequestInit & { headers: Record<string, string> }).headers[
        'X-Organization'
      ],
    ).toBe('o1')
  })
})

describe('roles', () => {
  function signedIn(me: unknown) {
    return mockApi((url) => {
      if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
      if (url.endsWith('/auth/me')) return { status: 200, body: me }
      if (url.startsWith('/api/v1/reports/dashboard'))
        return { status: 200, body: { ...DASHBOARD, money: null, enquiries: undefined } }
      if (url.startsWith('/api/v1/properties/')) return { status: 200, body: EMPTY_PAGE }
      return undefined
    })
  }

  it('hides money and team pages from staff', async () => {
    signedIn(STAFF_ME)
    renderApp(<AppRoutes />, '/app')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toHaveTextContent('Complaints')
    expect(nav).not.toHaveTextContent('Rent & payments')
    expect(nav).not.toHaveTextContent('Team')
    await waitFor(() => expect(screen.queryByText('Invoiced')).not.toBeInTheDocument())
  })

  it('blocks staff who open a manager URL directly', async () => {
    signedIn(STAFF_ME)
    renderApp(<AppRoutes />, '/app/billing')
    expect(
      await screen.findByText('You do not have access to this page. Ask the business owner.'),
    ).toBeInTheDocument()
  })

  it('owners see the full menu', async () => {
    signedIn(ME)
    renderApp(<AppRoutes />, '/app')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(nav).toHaveTextContent('Rent & payments')
    expect(nav).toHaveTextContent('Team')
  })
})

describe('home page', () => {
  it('shows the features and a way in for owners, tenants and the PG Manager team', async () => {
    mockApi((url) => (url.endsWith('/auth/refresh') ? { status: 401, body: {} } : undefined))
    renderApp(<AppRoutes />, '/')
    expect(
      await screen.findByRole('heading', { name: /Run every PG, room, tenant and rupee/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'PG owners and their team' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tenants' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'PG Manager team' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Coming soon/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Register my PG' })).toHaveAttribute(
      'href',
      '/register',
    )
    expect(screen.getByRole('heading', { name: 'Rent and receipts' })).toBeInTheDocument()
  })

  it('old marketplace addresses no longer open a listing', async () => {
    mockApi((url) => (url.endsWith('/auth/refresh') ? { status: 401, body: {} } : undefined))
    renderApp(<AppRoutes />, '/pg/lotus')
    expect(await screen.findByText(/not found/i)).toBeInTheDocument()
  })
})
