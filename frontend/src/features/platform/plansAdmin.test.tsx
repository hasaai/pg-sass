import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '../../api/queryClient'
import { AuthProvider } from '../../auth/AuthContext'
import { PLATFORM_ME, mockApi } from '../../test/render'
import type { Route as ApiRoute } from '../../test/render'
import { PaymentsPage } from './PaymentsPage'
import { PlansPage } from './PlansPage'

afterEach(() => vi.unstubAllGlobals())

const ADMIN = PLATFORM_ME

const CATALOG = {
  limits: [
    { key: 'properties', label: 'Properties', description: '' },
    { key: 'beds', label: 'Beds', description: '' },
  ],
  features: [{ key: 'finance', label: 'Expenses & profit', description: 'Track spending' }],
  allowances: [],
}

const PLANS = [
  {
    id: 'p1',
    key: 'basic',
    name: 'Basic',
    description: '',
    price_month: 49900,
    price_year: 499000,
    limits: { properties: 2, beds: 80 },
    features: [],
    allowances: {},
    trial_days: 0,
    is_public: true,
    is_active: true,
    position: 1,
    businesses: 4,
  },
]

function setup(page: React.ReactNode, extra: ApiRoute) {
  const fetchMock = mockApi((url, init) => {
    if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
    if (url.endsWith('/auth/me')) return { status: 200, body: ADMIN }
    return extra(url, init) ?? { status: 200, body: [] }
  })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/x']}>
        <AuthProvider>
          <Routes>
            <Route path="/x" element={page} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return fetchMock
}

const bodyOf = (call: unknown[] | undefined) =>
  JSON.parse(String((call?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>

describe('platform plans', () => {
  it('edits a plan: empty limit box means no limit', async () => {
    const fetchMock = setup(<PlansPage />, (url, init) => {
      if (url.includes('/platform/plan-catalog/')) return { status: 200, body: CATALOG }
      if (url.includes('/platform/plans/p1/') && init?.method === 'PATCH')
        return { status: 200, body: PLANS[0] }
      if (url.includes('/platform/plans/')) return { status: 200, body: PLANS }
      return undefined
    })
    expect(await screen.findByText('₹499 / month')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Basic' }))
    const beds = await screen.findByLabelText('Beds')
    await userEvent.clear(beds)
    await userEvent.click(screen.getByRole('checkbox', { name: /Expenses & profit/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit)?.method === 'PATCH')).toBe(
        true,
      ),
    )
    const call = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PATCH')
    expect(bodyOf(call)).toMatchObject({
      limits: { properties: 2, beds: null },
      features: ['finance'],
      price_month: 49900,
    })
  })

  it('lists gateways with test mode and why Paytm is not ready', async () => {
    setup(<PaymentsPage />, (url) => {
      if (url.includes('/platform/gateways/'))
        return {
          status: 200,
          body: [
            {
              code: 'razorpay',
              name: 'Razorpay',
              is_enabled: true,
              is_default: true,
              configured: true,
              test_mode: true,
              unavailable_reason: '',
            },
            {
              code: 'paytm',
              name: 'Paytm',
              is_enabled: false,
              is_default: false,
              configured: false,
              test_mode: false,
              unavailable_reason: 'Paytm needs one more library.',
            },
          ],
        }
      if (url.includes('/platform/payments/'))
        return { status: 200, body: { count: 0, results: [] } }
      return undefined
    })
    expect(await screen.findByText('Razorpay')).toBeInTheDocument()
    expect(screen.getByText('Test mode')).toBeInTheDocument()
    expect(screen.getByText('Paytm needs one more library.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Owners can pay with Paytm' })).toBeDisabled()
    expect(screen.getByText('No payments yet')).toBeInTheDocument()
  })
})
