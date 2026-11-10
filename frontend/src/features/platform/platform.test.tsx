import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '../../api/queryClient'
import type { Property } from '../../api/types'
import { AuthProvider } from '../../auth/AuthContext'
import { featureOfPath, isFeatureOn } from '../../components/shell/features'
import { PLATFORM_ME, ME, mockApi } from '../../test/render'
import type { Route as ApiRoute } from '../../test/render'
import { DocumentsTab } from '../properties/detail/DocumentsTab'
import { BusinessDetailPage } from './BusinessDetailPage'
import { PlatformShell } from './PlatformShell'
import { PropertyReviewPage } from './PropertyReviewPage'
import { actionWords } from './types'

afterEach(() => vi.unstubAllGlobals())

const ADMIN = PLATFORM_ME

function api(me: unknown, extra: ApiRoute) {
  return mockApi((url, init) => {
    if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
    if (url.endsWith('/auth/me')) return { status: 200, body: me }
    return extra(url, init) ?? { status: 200, body: [] }
  })
}

function renderAt(path: string, routes: React.ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>{routes}</Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const bodyOf = (call: unknown[] | undefined) =>
  JSON.parse(String((call?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>

const ORG = {
  id: 'o1',
  name: 'Demo Stays',
  slug: 'demo',
  contact_phone: '',
  status: 'active',
  status_label: 'Active',
  suspended_reason: '',
  logo_url: null,
  owners: [{ id: 'u1', full_name: 'Asha', email: 'asha@example.com' }],
  properties_count: 2,
  members_count: 3,
  beds_total: 20,
  tenants_count: 12,
  awaiting_verification: 0,
  disabled_features: [],
  features: [
    { key: 'finance', label: 'Expenses & profit', description: 'x', enabled: true },
    { key: 'marketplace', label: 'Marketplace', description: 'y', enabled: true },
  ],
  created_at: '2026-01-01T00:00:00Z',
}

describe('feature switches', () => {
  it('knows which screens belong to which module', () => {
    expect(featureOfPath('/app/finance')).toBe('finance')
    expect(featureOfPath('/app/billing/reminders')).toBe('reminders')
    expect(featureOfPath('/app/billing')).toBeNull() // rent is core
    expect(featureOfPath('/app/enquiries/5')).toBe('marketplace')
    expect(isFeatureOn('finance', ['finance'])).toBe(false)
    expect(actionWords('property.document_downloaded')).toBe('Property document downloaded')
  })

  it('platform admin switches a module off for a business', async () => {
    const fetchMock = api(ADMIN, (url, init) => {
      if (url === '/api/v1/platform/organizations/o1/') return { status: 200, body: ORG }
      if (url === '/api/v1/platform/organizations/o1/features/' && init.method === 'PUT')
        return { status: 200, body: { ...ORG, disabled_features: ['marketplace'] } }
      if (url.startsWith('/api/v1/platform/properties/'))
        return { status: 200, body: { count: 0, next: null, previous: null, results: [] } }
      return undefined
    })
    const user = userEvent.setup()
    renderAt(
      '/platform/businesses/o1',
      <Route path="/platform/businesses/:id" element={<BusinessDetailPage />} />,
    )
    const save = await screen.findByRole('button', { name: 'Save features' })
    expect(save).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /Marketplace/ }))
    await user.click(save)
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(true),
    )
    expect(bodyOf(fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT'))).toEqual({
      disabled_features: ['marketplace'],
    })
  })

  it('suspending needs a reason', async () => {
    api(ADMIN, (url) =>
      url === '/api/v1/platform/organizations/o1/'
        ? { status: 200, body: ORG }
        : url.startsWith('/api/v1/platform/properties/')
          ? { status: 200, body: { count: 0, next: null, previous: null, results: [] } }
          : undefined,
    )
    const user = userEvent.setup()
    renderAt(
      '/platform/businesses/o1',
      <Route path="/platform/businesses/:id" element={<BusinessDetailPage />} />,
    )
    await user.click(await screen.findByRole('button', { name: 'Suspend' }))
    const confirm = screen.getByRole('button', { name: 'Suspend business' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/Reason/), 'Unpaid')
    expect(confirm).toBeEnabled()
  })
})

describe('platform portal access', () => {
  it('is closed to business owners', async () => {
    api(ME, () => undefined)
    renderAt('/platform', <Route path="/platform" element={<PlatformShell />} />)
    expect(await screen.findByText('Platform team only')).toBeInTheDocument()
  })
})

describe('verification review', () => {
  const DETAIL = {
    id: 'p1',
    name: 'Maple Residency',
    organization_id: 'o1',
    organization_name: 'Demo Stays',
    property_type_label: 'Standalone building',
    status_label: 'Open',
    verification_status: 'submitted',
    verification_status_label: 'Being checked',
    address_line: '18, 5th Main',
    locality: 'HSR Layout',
    city: 'Bengaluru',
    pincode: '560102',
    latitude: null,
    longitude: null,
    logo_url: null,
    documents: [
      {
        id: 'd1',
        kind: 'ownership_proof',
        kind_label: 'Ownership proof (sale deed, khata)',
        display_title: 'Sale deed',
        file_name: 'deed.pdf',
        size_bytes: 2048,
        is_proof: true,
        expiry: 'no_expiry',
        expiry_label: 'No expiry date',
        note: '',
        created_at: '2026-10-01T00:00:00Z',
      },
    ],
    history: [],
  }

  it('asks for a note before requesting changes, then sends the decision', async () => {
    const fetchMock = api(ADMIN, (url, init) => {
      if (url === '/api/v1/platform/properties/p1/') return { status: 200, body: DETAIL }
      if (url === '/api/v1/platform/properties/p1/verification/' && init.method === 'POST')
        return { status: 200, body: { ...DETAIL, verification_status_label: 'Changes needed' } }
      return undefined
    })
    const user = userEvent.setup()
    renderAt(
      '/platform/properties/p1',
      <Route path="/platform/properties/:id" element={<PropertyReviewPage />} />,
    )
    expect(await screen.findByText('Sale deed')).toBeInTheDocument()
    const ask = screen.getByRole('button', { name: 'Ask for changes' })
    expect(ask).toBeDisabled()
    await user.type(screen.getByLabelText(/Note to the owner/), 'Page 2 missing')
    await user.click(ask)
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) => u === '/api/v1/platform/properties/p1/verification/'),
      ).toBe(true),
    )
    const post = fetchMock.mock.calls.find(
      ([u]) => u === '/api/v1/platform/properties/p1/verification/',
    )
    expect(bodyOf(post)).toEqual({ decision: 'changes_requested', note: 'Page 2 missing' })
  })
})

describe('property documents', () => {
  const PROP = {
    id: 'p1',
    name: 'Lotus',
    verification_status: 'unverified',
    verification_status_label: 'Not checked yet',
  } as Property

  it('staff are told documents are for owners and managers', () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <DocumentsTab property={PROP} canManage={false} />
      </QueryClientProvider>,
    )
    expect(screen.getByText('Only owners and managers can see documents')).toBeInTheDocument()
  })

  it('needs a file and a kind, and blocks sending for verification without proof', async () => {
    mockApi((url) => {
      if (url === '/api/v1/properties/p1/documents/') return { status: 200, body: [] }
      if (url === '/api/v1/properties/p1/verification/') return { status: 200, body: [] }
      return undefined
    })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={createQueryClient()}>
        <DocumentsTab property={PROP} canManage />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('button', { name: /Send for verification/ })).toBeDisabled()
    await user.click(screen.getAllByRole('button', { name: /Upload/ })[0]!)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText('Choose what kind of document it is.')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/What is it/), 'trade_license')
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText('Choose a file to upload.')).toBeInTheDocument()
  })
})
