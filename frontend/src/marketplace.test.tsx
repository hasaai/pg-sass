import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from './App'
import { ME, mockApi, renderApp } from './test/render'

afterEach(() => vi.unstubAllGlobals())

const PAGE = (results: unknown[]) => ({ next: null, previous: null, results })
const SEEKER = { ...ME, id: 'u9', full_name: 'Ishita Pai', phone: '9811100001', memberships: [] }
const anonymous = (url: string) => url.endsWith('/auth/refresh')
const signedIn = (url: string) =>
  url.endsWith('/auth/refresh') ? { status: 200, body: { access: 'tok' } } : undefined

describe('signing in without a business', () => {
  it('is sent to the profile step, which creates their business', async () => {
    mockApi((url) => {
      if (anonymous(url)) return { status: 401, body: {} }
      if (url.endsWith('/auth/login')) return { status: 200, body: { access: 'tok', user: SEEKER } }
      if (url.endsWith('/onboarding/profile'))
        return {
          status: 200,
          body: {
            full_name: 'Ishita Pai',
            email: 'someone@example.com',
            email_verified: false,
            phone_masked: '98xxxxx001',
            has_business: false,
            marketing: false,
            terms_version: 'v',
            privacy_version: 'v',
          },
        }
      return undefined
    })
    const user = userEvent.setup()
    renderApp(<AppRoutes />, '/login')
    await user.click(await screen.findByRole('tab', { name: 'Email and password' }))
    await user.type(await screen.findByLabelText('Email'), 'someone@example.com')
    await user.type(screen.getByLabelText('Password'), 'whatever-123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'About you' })).toBeInTheDocument()
    expect(screen.getByLabelText('Business name (optional)')).toBeInTheDocument()
  })
})

describe('operator: applications', () => {
  it('approves an applicant into a free bed of the listed property', async () => {
    const fetchMock = mockApi((url, init) => {
      const auth = signedIn(url)
      if (auth) return auth
      if (url.endsWith('/auth/me')) return { status: 200, body: ME }
      if (url.startsWith('/api/v1/applications/a1/approve/') && init.method === 'POST')
        return { status: 200, body: {} }
      if (url.startsWith('/api/v1/applications/'))
        return {
          status: 200,
          body: PAGE([
            {
              id: 'a1',
              listing: { slug: 'lotus', headline: 'Lotus', name: 'Lotus', locality: 'HSR Layout' },
              full_name: 'Divya Rao',
              phone: '9845022222',
              email: '',
              status: 'pending',
              move_in_date: '2026-11-01',
              preferred_sharing: 2,
              occupation: 'Engineer',
              id_type: 'aadhaar',
              id_last4: '7788',
              message: '',
              decline_reason: '',
              allocated: null,
              created_at: '2026-10-10T10:00:00Z',
            },
          ]),
        }
      if (url.startsWith('/api/v1/listings/'))
        return { status: 200, body: PAGE([{ id: 'l1', slug: 'lotus', property: 'p1' }]) }
      if (url.startsWith('/api/v1/beds/'))
        return {
          status: 200,
          body: PAGE(
            url.includes('status=vacant')
              ? [
                  {
                    id: 'b1',
                    room_number: '101',
                    label: 'A',
                    sharing: 2,
                    monthly_rent: 900000,
                    status: 'vacant',
                  },
                ]
              : [],
          ),
        }
      return undefined
    })
    const user = userEvent.setup()
    renderApp(<AppRoutes />, '/app/applications')
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve into a bed' })
    await user.selectOptions(await within(dialog).findByLabelText('Bed in Lotus'), 'b1')
    expect(within(dialog).getByLabelText('Security deposit (₹)')).toHaveValue('18000')
    await user.type(within(dialog).getByLabelText('Deposit collected now (₹)'), '9000')
    await user.click(within(dialog).getByRole('button', { name: 'Approve and check in' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/approve/'))).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/approve/'))!
    expect(JSON.parse(String(call[1]!.body))).toEqual({
      bed: 'b1',
      check_in: '2026-11-01',
      deposit_amount: 1800000,
      deposit_collected: 900000,
    })
    // beds were requested only for the listing's own property
    expect(
      fetchMock.mock.calls.some(
        ([u]) => String(u).includes('/beds/') && String(u).includes('property=p1'),
      ),
    ).toBe(true)
  })
})

describe('operator: finance', () => {
  it('shows rent in, expenses out and the profit for the month', async () => {
    mockApi((url) => {
      const auth = signedIn(url)
      if (auth) return auth
      if (url.endsWith('/auth/me')) return { status: 200, body: ME }
      if (url.startsWith('/api/v1/reports/finance'))
        return {
          status: 200,
          body: {
            period: '2026-10',
            income: 5000000,
            income_by_mode: { upi: 4000000, cash: 1000000 },
            expenses: 1200000,
            expenses_by_category: [{ category: 'salary', label: 'Salary', total: 1200000 }],
            net: 3800000,
            salaries_due: [
              {
                employee_id: 'e1',
                full_name: 'Basavaraj',
                role_title: 'Cook',
                monthly_salary: 1800000,
                pay_day: 5,
              },
            ],
          },
        }
      if (url.startsWith('/api/v1/')) return { status: 200, body: PAGE([]) }
      return undefined
    })
    renderApp(<AppRoutes />, '/app/finance')
    expect(await screen.findByText('Profit')).toBeInTheDocument()
    expect(screen.getByText('₹38,000')).toBeInTheDocument()
    expect(screen.getByText('₹50,000')).toBeInTheDocument()
    expect(screen.getByText(/1 salary not paid yet/)).toBeInTheDocument()
    expect(screen.getByText('UPI')).toBeInTheDocument()
  })
})
