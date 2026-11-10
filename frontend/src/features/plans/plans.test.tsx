import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '../../api/queryClient'
import { AuthProvider } from '../../auth/AuthContext'
import { ME, STAFF_ME, mockApi } from '../../test/render'
import type { Route as ApiRoute } from '../../test/render'
import { openPaymentWindow } from './checkout'
import {
  limitsFromForm,
  limitsToForm,
  monthsSaved,
  nearLimits,
  planStatusWords,
  priceWords,
  usageLevel,
  usageWords,
} from './plans'
import { YourPlanPage } from './YourPlanPage'

vi.mock('./checkout', () => ({ openPaymentWindow: vi.fn() }))
const openWindow = vi.mocked(openPaymentWindow)

afterEach(() => {
  vi.unstubAllGlobals()
  openWindow.mockReset()
})

describe('plan helpers', () => {
  it('describes usage and warns at 80%', () => {
    expect(usageWords({ used: 3, limit: 5 })).toBe('3 of 5')
    expect(usageWords({ used: 12, limit: null })).toBe('12 · no limit')
    expect(usageLevel({ used: 3, limit: 5 })).toBe('ok')
    expect(usageLevel({ used: 4, limit: 5 })).toBe('near')
    expect(usageLevel({ used: 6, limit: 5 })).toBe('full')
    expect(usageLevel({ used: 900, limit: null })).toBe('ok')
    expect(
      nearLimits([
        { key: 'beds', label: 'Beds', used: 24, limit: 25 },
        { key: 'rooms', label: 'Rooms', used: 1, limit: 15 },
      ]).map((u) => u.key),
    ).toEqual(['beds'])
  })

  it('shows prices and the yearly saving', () => {
    const basic = { price_month: 49900, price_year: 499000 }
    expect(priceWords(basic, 'month')).toBe('₹499 / month')
    expect(priceWords(basic, 'year')).toBe('₹4,990 / year')
    expect(priceWords({ price_month: 0, price_year: 0 }, 'month')).toBe('Free')
    expect(monthsSaved(basic)).toBe(2)
  })

  it('reads limit boxes: empty means no limit', () => {
    expect(limitsFromForm({ beds: '40', rooms: '', team: ' 3 ' })).toEqual({
      limits: { beds: 40, rooms: null, team: 3 },
      bad: [],
    })
    expect(limitsFromForm({ beds: 'lots' }).bad).toEqual(['beds'])
    expect(limitsToForm(['beds', 'rooms'], { beds: 40, rooms: null })).toEqual({
      beds: '40',
      rooms: '',
    })
  })

  it('words the plan status', () => {
    expect(planStatusWords({ status: 'trial', days_left: 9, ends_on: '2026-10-28' })).toBe(
      'Free trial · 9 days left',
    )
    expect(planStatusWords({ status: 'active', days_left: null, ends_on: null })).toBe(
      'Active · no end date',
    )
    expect(planStatusWords({ status: 'expired', days_left: null, ends_on: '2026-10-01' })).toMatch(
      /ended/,
    )
  })
})

const MY_PLAN = {
  plan_key: 'pro',
  plan_name: 'Pro',
  status: 'trial',
  status_label: 'Free trial',
  ends_on: '2026-10-21',
  days_left: 2,
  subscribed_plan: 'pro',
  usage: [
    { key: 'properties', label: 'Properties', used: 1, limit: 5 },
    { key: 'beds', label: 'Beds', used: 290, limit: 300 },
  ],
  features: [
    { key: 'finance', label: 'Expenses & profit', on: true },
    { key: 'verification', label: 'Tenant verification', on: true },
  ],
  allowances: [{ key: 'ekyc_checks', label: 'e-KYC checks', per_month: 50 }],
}

const CHOICES = [
  {
    key: 'free',
    name: 'Free',
    description: '',
    price_month: 0,
    price_year: 0,
    limits: { properties: 1, beds: 25, team: 1 },
    features: [],
    allowances: {},
  },
  {
    key: 'basic',
    name: 'Basic',
    description: 'For one or two PGs',
    price_month: 49900,
    price_year: 499000,
    limits: { properties: 2, beds: 80, team: 3 },
    features: ['finance'],
    allowances: {},
  },
]

const GATEWAYS = [
  { code: 'razorpay', name: 'Razorpay', test_mode: true, is_default: true },
  { code: 'cashfree', name: 'Cashfree', test_mode: true, is_default: false },
]

function setup(me: unknown, extra: ApiRoute = () => undefined) {
  const fetchMock = mockApi((url, init) => {
    if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
    if (url.endsWith('/auth/me')) return { status: 200, body: me }
    const hit = extra(url, init)
    if (hit) return hit
    if (url.includes('/plan/choices/')) return { status: 200, body: CHOICES }
    if (url.includes('/plan/gateways/')) return { status: 200, body: GATEWAYS }
    if (url.includes('/plan/payments/')) return { status: 200, body: [] }
    if (url.includes('/plan/')) return { status: 200, body: MY_PLAN }
    return { status: 200, body: [] }
  })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/app/plan']}>
        <AuthProvider>
          <Routes>
            <Route path="/app/plan" element={<YourPlanPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return fetchMock
}

const bodyOf = (call: unknown[] | undefined) =>
  JSON.parse(String((call?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>

describe('Your plan page', () => {
  it('shows usage, warnings and the plans', async () => {
    setup(ME)
    expect(await screen.findByText('290 of 300')).toBeInTheDocument()
    expect(screen.getByText('Free trial · 2 days left')).toBeInTheDocument()
    expect(screen.getByText('Your free trial ends soon')).toBeInTheDocument()
    expect(screen.getByText(/nearly used all your beds/)).toBeInTheDocument()
    expect(screen.getByText('e-KYC checks: 50 a month')).toBeInTheDocument()
    expect(screen.getByText('₹499 / month')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Yearly' }))
    expect(screen.getByText('₹4,990 / year')).toBeInTheDocument()
    expect(screen.getByText('2 months free')).toBeInTheDocument()
  })

  it('pays with Razorpay and confirms with the server', async () => {
    openWindow.mockResolvedValue({
      kind: 'paid',
      result: {
        razorpay_order_id: 'order_1',
        razorpay_payment_id: 'pay_1',
        razorpay_signature: 's',
      },
    })
    const fetchMock = setup(ME, (url, init) => {
      if (url.includes('/plan/checkout/') && init?.method === 'POST')
        return {
          status: 201,
          body: { payment: { id: 'pm1', gateway: 'razorpay' }, checkout: { order_id: 'order_1' } },
        }
      if (url.includes('/plan/confirm/'))
        return { status: 200, body: { id: 'pm1', status: 'paid', plan_name: 'Basic' } }
      return undefined
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Basic' }))
    expect(await screen.findByText('Razorpay')).toBeInTheDocument()
    expect(screen.getAllByText('Test mode').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: /Pay ₹499/ }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/plan/confirm/'))).toBe(true),
    )
    const start = fetchMock.mock.calls.find(([u]) => String(u).includes('/plan/checkout/'))
    expect(bodyOf(start)).toEqual({ plan: 'basic', period: 'month', gateway: 'razorpay' })
    const done = fetchMock.mock.calls.find(([u]) => String(u).includes('/plan/confirm/'))
    expect(bodyOf(done)).toMatchObject({ payment: 'pm1', result: { razorpay_payment_id: 'pay_1' } })
    expect(openWindow).toHaveBeenCalledWith('razorpay', { order_id: 'order_1' })
  })

  it('lets the owner pick Cashfree instead', async () => {
    openWindow.mockResolvedValue({ kind: 'redirecting' })
    const fetchMock = setup(ME, (url, init) =>
      url.includes('/plan/checkout/') && init?.method === 'POST'
        ? { status: 201, body: { payment: { id: 'pm2', gateway: 'cashfree' }, checkout: {} } }
        : undefined,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Basic' }))
    await userEvent.click(await screen.findByRole('radio', { name: /Cashfree/ }))
    await userEvent.click(screen.getByRole('button', { name: /Pay ₹499/ }))
    await waitFor(() => expect(openWindow).toHaveBeenCalled())
    const start = fetchMock.mock.calls.find(([u]) => String(u).includes('/plan/checkout/'))
    expect(bodyOf(start).gateway).toBe('cashfree')
  })

  it('staff can see the plan but not pay', async () => {
    setup(STAFF_ME)
    expect(await screen.findByText('290 of 300')).toBeInTheDocument()
    expect(
      screen.getByText(/Only the business owner \(or someone they allow\) can change/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose Basic' })).not.toBeInTheDocument()
  })
})
