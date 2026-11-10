import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../../App'
import { ME, mockApi, renderApp } from '../../test/render'

afterEach(() => vi.unstubAllGlobals())

const NEW_USER = {
  ...ME,
  full_name: '',
  email: null,
  email_verified: false,
  memberships: [],
}
const PROFILE = {
  full_name: '',
  email: null,
  email_verified: false,
  phone_masked: '98xxxxx345',
  has_business: false,
  marketing: false,
  terms_version: '2026-11-draft',
  privacy_version: '2026-11-draft',
}
const bodyOf = (init: RequestInit | undefined) =>
  JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

describe('owner sign-up', () => {
  it('agrees, confirms the mobile, adds a profile and lands on the dashboard', async () => {
    let me: unknown = NEW_USER
    const fetchMock = mockApi((url) => {
      if (url.endsWith('/auth/refresh')) return { status: 401, body: {} }
      if (url.endsWith('/auth/signup/start'))
        return { status: 200, body: { phone_masked: '98xxxxx345', resend_in: 60 } }
      if (url.endsWith('/auth/signup/finish'))
        return { status: 201, body: { access: 'tok', user: NEW_USER } }
      if (url.endsWith('/onboarding/profile')) {
        me = { ...ME, email_verified: false }
        return { status: 200, body: PROFILE }
      }
      if (url.endsWith('/auth/me')) return { status: 200, body: me }
      if (url.includes('/reports/dashboard')) return { status: 200, body: {} }
      if (url.includes('/properties/'))
        return { status: 200, body: { next: null, previous: null, results: [] } }
      return undefined
    })
    const user = userEvent.setup()
    renderApp(<AppRoutes />, '/register')

    await user.type(await screen.findByLabelText('Mobile number'), '9845012345')
    const send = screen.getByRole('button', { name: 'Send code' })
    expect(send).toBeDisabled() // Terms and Privacy first
    await user.click(screen.getByRole('checkbox', { name: /Terms and Conditions/ }))
    await user.click(screen.getByRole('checkbox', { name: /Privacy Policy/ }))
    await user.click(send)

    expect(await screen.findByText('98xxxxx345')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resend code in 1:00/ })).toBeDisabled()
    await user.type(screen.getByLabelText('Code'), '246810')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('heading', { name: 'About you' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Your name'), 'Asha Rao')
    await user.type(screen.getByLabelText('Email'), 'asha@example.com')
    await user.click(screen.getByRole('button', { name: 'Continue to my dashboard' }))

    expect(await screen.findByText('Confirm your email')).toBeInTheDocument()
    const finish = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/auth/signup/finish'))
    expect(bodyOf(finish?.[1] as RequestInit)).toEqual({
      phone: '9845012345',
      code: '246810',
      accept_terms: true,
      accept_privacy: true,
      marketing: false,
    })
    const put = fetchMock.mock.calls.find(
      ([u, i]) => String(u).endsWith('/onboarding/profile') && (i as RequestInit)?.method === 'PUT',
    )
    expect(bodyOf(put?.[1] as RequestInit)).toEqual({
      full_name: 'Asha Rao',
      email: 'asha@example.com',
      business_name: '',
    })
  })

  it('shows the wrong-code message', async () => {
    mockApi((url) => {
      if (url.endsWith('/auth/refresh')) return { status: 401, body: {} }
      if (url.endsWith('/auth/login/mobile/start'))
        return { status: 200, body: { phone_masked: '98xxxxx345', resend_in: 60 } }
      if (url.endsWith('/auth/login/mobile/finish'))
        return {
          status: 400,
          body: {
            error: {
              code: 'validation_error',
              message: 'Invalid input.',
              fields: { code: ['That code is not right. 4 tries left.'] },
            },
          },
        }
      return undefined
    })
    const user = userEvent.setup()
    renderApp(<AppRoutes />, '/login')
    await user.type(await screen.findByLabelText('Mobile number'), '9845012345')
    await user.click(screen.getByRole('button', { name: 'Send code' }))
    await user.type(await screen.findByLabelText('Code'), '111111')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('That code is not right. 4 tries left.')).toBeInTheDocument()
  })

  it('confirms the email from the link', async () => {
    const fetchMock = mockApi((url) => {
      if (url.endsWith('/auth/refresh')) return { status: 401, body: {} }
      if (url.endsWith('/auth/email/confirm')) return { status: 200, body: { sent: true } }
      return undefined
    })
    renderApp(<AppRoutes />, '/confirm-email?token=abc')
    expect(await screen.findByText('Thank you, your email is confirmed.')).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/auth/email/confirm'))).toBe(
        true,
      ),
    )
  })
})

const CHECK = {
  status: 'draft',
  status_label: 'Not sent yet',
  id_type: 'pan',
  id_last4: '234F',
  name_on_id: 'Asha Rao',
  submitted_at: null,
  decided_at: null,
  reviewer_note: '',
  can_edit: true,
  missing: ['Upload a photo or scan of the front of the ID.'],
  documents: [],
  events: [],
}

describe('owner identity check', () => {
  it('shows what is missing and sends once complete', async () => {
    let check: Record<string, unknown> = CHECK
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
      if (url.endsWith('/auth/me')) return { status: 200, body: ME }
      if (url.endsWith('/onboarding/owner-check/submit')) {
        check = {
          ...check,
          status: 'submitted',
          status_label: 'Sent for checking',
          can_edit: false,
        }
        return { status: 200, body: check }
      }
      if (url.endsWith('/onboarding/owner-check/documents') && init?.method === 'POST') {
        check = { ...check, missing: [] }
        return {
          status: 201,
          body: { id: 'd1', kind: 'id_front', kind_label: 'ID, front', file_name: 'id.png' },
        }
      }
      if (url.endsWith('/onboarding/owner-check')) return { status: 200, body: check }
      return undefined
    })
    const user = userEvent.setup()
    renderApp(<AppRoutes />, '/app/owner-verification')

    expect(await screen.findByText('Upload a photo or scan of the front of the ID.')).toBeVisible()
    const send = screen.getByRole('button', { name: 'Send for checking' })
    expect(send).toBeDisabled()
    expect(screen.getByText(/You can use the whole app while this is checked/)).toBeVisible()

    await user.upload(
      screen.getByLabelText('Upload a file'),
      new File(['x'], 'id.png', { type: 'image/png' }),
    )
    await waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    expect(await screen.findByText('Sent for checking', { selector: 'span' })).toBeVisible()
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/owner-check/submit'))).toBe(true)
  })
})
