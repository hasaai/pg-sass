import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '../../api/queryClient'
import { AuthProvider } from '../../auth/AuthContext'
import { RequireAuth } from '../../auth/guards'
import { SmsGatewaysPage } from '../../features/platform/SmsGatewaysPage'
import { countdown, gatewayStatus } from '../../lib/mobile'
import { PLATFORM_ME, ME, mockApi } from '../../test/render'
import type { Route as ApiRoute } from '../../test/render'
import { VerifyMobilePage } from './VerifyMobilePage'

afterEach(() => vi.unstubAllGlobals())

const UNVERIFIED = { ...ME, phone_verified: false }

function setup(me: () => unknown, extra: ApiRoute, path = '/verify-mobile') {
  const fetchMock = mockApi((url, init) => {
    if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
    if (url.endsWith('/auth/me')) return { status: 200, body: me() }
    return extra(url, init) ?? { status: 200, body: [] }
  })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/verify-mobile" element={<VerifyMobilePage />} />
            <Route path="/app" element={<RequireAuth />}>
              <Route index element={<p>Dashboard</p>} />
            </Route>
            <Route path="/platform/sms" element={<SmsGatewaysPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return fetchMock
}

const bodyOf = (call: unknown[] | undefined) =>
  JSON.parse(String((call?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>

describe('mobile helpers', () => {
  it('formats the resend timer and gateway status', () => {
    expect(countdown(59)).toBe('0:59')
    expect(countdown(61)).toBe('1:01')
    expect(countdown(-3)).toBe('0:00')
    expect(gatewayStatus({ configured: false, is_enabled: true }).label).toBe('Not set up')
    expect(gatewayStatus({ configured: true, is_enabled: true }).label).toBe('On')
    expect(gatewayStatus({ configured: true, is_enabled: false }).label).toBe('Off')
  })
})

describe('confirming the mobile', () => {
  it('sends an unconfirmed owner from the app to the code screen', async () => {
    setup(
      () => UNVERIFIED,
      (url) =>
        url.includes('/auth/mobile/')
          ? {
              status: 200,
              body: {
                phone: '9845012345',
                phone_masked: '98xxxxx345',
                phone_verified: false,
                resend_in: 40,
              },
            }
          : undefined,
      '/app',
    )
    expect(await screen.findByText('Confirm your mobile')).toBeInTheDocument()
    expect(screen.getByText('98xxxxx345')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resend code in 0:4/ })).toBeDisabled()
  })

  it('confirms the code and opens the dashboard', async () => {
    let verified = false
    const fetchMock = setup(
      () => ({ ...ME, phone_verified: verified }),
      (url) => {
        if (url.includes('/auth/mobile/confirm/')) {
          verified = true
          return { status: 200, body: { ...ME, phone_verified: true } }
        }
        if (url.includes('/auth/mobile/'))
          return {
            status: 200,
            body: {
              phone: '9845012345',
              phone_masked: '98xxxxx345',
              phone_verified: false,
              resend_in: 0,
            },
          }
        return undefined
      },
    )
    await userEvent.type(await screen.findByLabelText('Code'), '24a6810')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/auth/mobile/confirm/'))
    expect(bodyOf(call)).toEqual({ code: '246810' })
  })

  it('shows a wrong code message', async () => {
    setup(
      () => UNVERIFIED,
      (url) => {
        if (url.includes('/auth/mobile/confirm/'))
          return {
            status: 400,
            body: {
              error: {
                code: 'invalid',
                message: 'Invalid input.',
                fields: { code: 'That code is not right. 4 tries left.' },
              },
            },
          }
        if (url.includes('/auth/mobile/'))
          return {
            status: 200,
            body: {
              phone: '9845012345',
              phone_masked: '98xxxxx345',
              phone_verified: false,
              resend_in: 0,
            },
          }
        return undefined
      },
    )
    await userEvent.type(await screen.findByLabelText('Code'), '111111')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('That code is not right. 4 tries left.')).toBeInTheDocument()
  })

  it('changes the number and sends a new code', async () => {
    const fetchMock = setup(
      () => UNVERIFIED,
      (url) => {
        if (url.includes('/auth/mobile/send-code/'))
          return { status: 200, body: { phone_masked: '99xxxxx122', resend_in: 60 } }
        if (url.includes('/auth/mobile/'))
          return {
            status: 200,
            body: {
              phone: '9845012345',
              phone_masked: '98xxxxx345',
              phone_verified: false,
              resend_in: 0,
            },
          }
        return undefined
      },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Wrong number? Change it' }))
    await userEvent.type(screen.getByLabelText('Mobile number'), '9900011122')
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText('99xxxxx122')).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/send-code/'))
    expect(bodyOf(call)).toEqual({ phone: '9900011122' })
  })
})

describe('platform SMS gateways', () => {
  it('lists gateways with the .env settings each needs and sends a test SMS', async () => {
    const fetchMock = setup(
      () => PLATFORM_ME,
      (url, init) => {
        if (url.includes('/platform/sms-gateways/console/test/'))
          return { status: 200, body: { ok: true, reply_id: 'console', error: '' } }
        if (url.includes('/platform/sms-gateways/'))
          return {
            status: 200,
            body: [
              {
                code: 'console',
                name: 'Test (Terminal)',
                position: 0,
                is_enabled: true,
                configured: true,
                unavailable_reason: '',
                help: 'Prints the code in the backend Terminal.',
                settings_needed: [],
                warnings: [],
                last_ok_at: null,
                last_error_at: null,
                last_error: '',
              },
              {
                code: 'twofactor',
                name: '2Factor',
                position: 1,
                is_enabled: false,
                configured: false,
                unavailable_reason:
                  'Missing TWOFACTOR_API_KEY. Press Enter keys, or add them to backend/.env.',
                help: '2factor.in dashboard',
                settings_needed: [
                  {
                    env: 'TWOFACTOR_API_KEY',
                    label: 'API key',
                    required: true,
                    secret: true,
                    hint: '2Factor dashboard, API key',
                    is_set: false,
                    set_in: '',
                    display: '',
                  },
                ],
                warnings: ['The template name looks like message text.'],
                last_ok_at: null,
                last_error_at: null,
                last_error: '',
              },
            ],
          }
        if (url.includes('/platform/sms-log/'))
          return { status: 200, body: { count: 0, results: [] } }
        void init
        return undefined
      },
      '/platform/sms',
    )
    expect(await screen.findByText('2Factor')).toBeInTheDocument()
    expect(screen.getByText('Not set up')).toBeInTheDocument()
    expect(screen.getByText('The template name looks like message text.')).toBeInTheDocument()
    expect(screen.getByText('No real SMS gateway is on')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Send codes with 2Factor' })).toBeDisabled()
    await userEvent.type(
      screen.getByLabelText('Mobile for a test SMS with Test (Terminal)'),
      '9845012345',
    )
    await userEvent.click(screen.getByRole('button', { name: /Send test SMS/ }))
    expect(await screen.findByText(/Sent \(code 123456\)/)).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/test/'))
    expect(bodyOf(call)).toEqual({ phone: '9845012345' })

    await userEvent.click(screen.getByRole('button', { name: /Enter keys/ }))
    await userEvent.type(screen.getByLabelText('API key'), 'my-2factor-key-123')
    await userEvent.click(screen.getByRole('button', { name: 'Save keys' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            String(u).includes('/sms-gateways/twofactor/') &&
            (i as RequestInit)?.method === 'PATCH',
        ),
      ).toBe(true),
    )
    const patch = fetchMock.mock.calls.find(
      ([u, i]) =>
        String(u).includes('/sms-gateways/twofactor/') && (i as RequestInit)?.method === 'PATCH',
    )
    expect(bodyOf(patch)).toEqual({ set_credentials: { TWOFACTOR_API_KEY: 'my-2factor-key-123' } })
  })
})
