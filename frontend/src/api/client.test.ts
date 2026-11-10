import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api, buildUrl, download, session } from './client'

/** Await a request that must fail and return its ApiError. */
async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (e) {
    return e as ApiError
  }
  throw new Error('expected the request to fail')
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    session.setAccessToken('old-token')
    session.setOrganization('org-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    session.setAccessToken(null)
    session.setOrganization(null)
    session.onAuthLost(null)
  })

  it('builds URLs and drops empty params', () => {
    expect(buildUrl('/beds/', { status: 'vacant', property: '', room: undefined })).toBe(
      '/api/v1/beds/?status=vacant',
    )
  })

  it('sends the token and organization header', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))
    await api.get('/members/')
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.headers.Authorization).toBe('Bearer old-token')
    expect(init.headers['X-Organization']).toBe('org-1')
    expect(init.credentials).toBe('same-origin')
  })

  it('turns the server error format into ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        error: { code: 'validation_error', message: 'Invalid input.', fields: { phone: ['Bad.'] } },
      }),
    )
    const error = await failure(api.post('/tenants/', {}))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('validation_error')
    expect(error.fieldError('phone')).toBe('Bad.')
  })

  it('refreshes once on 401 and retries', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(401, { error: { code: 'token_not_valid', message: 'x', fields: {} } }),
      )
      .mockResolvedValueOnce(json(200, { access: 'new-token' }))
      .mockResolvedValueOnce(json(200, { id: 1 }))
    await expect(api.get('/auth/me')).resolves.toEqual({ id: 1 })
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/auth/refresh')
    expect(fetchMock.mock.calls[2]![1].headers.Authorization).toBe('Bearer new-token')
  })

  it('shares one refresh between concurrent requests', async () => {
    let calls = 0
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        calls += 1
        return json(200, { access: 'fresh' })
      }
      const auth = (init.headers as Record<string, string>).Authorization
      return auth === 'Bearer fresh' ? json(200, { ok: url }) : json(401, {})
    })
    await Promise.all([api.get('/a/'), api.get('/b/'), api.get('/c/')])
    expect(calls).toBe(1)
  })

  it('signs out when the refresh fails', async () => {
    const lost = vi.fn()
    session.onAuthLost(lost)
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, {}))
    const error = await failure(api.get('/members/'))
    expect(error.status).toBe(401)
    expect(lost).toHaveBeenCalledOnce()
    expect(session.hasAccessToken()).toBe(false)
  })

  it('reports network failures clearly', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const error = await failure(api.get('/x/'))
    expect(error.code).toBe('network_error')
  })

  it('hides server internals on 500', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Traceback', { status: 500 }))
    const error = await failure(api.get('/x/'))
    expect(error.message).toBe('The server had a problem. Please try again.')
  })

  it('handles 204 No Content', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(api.delete('/members/1/')).resolves.toBeUndefined()
  })
  it('uploads files as multipart without forcing a JSON content type', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 'p1' }))
    const form = new FormData()
    form.append('image', new Blob(['x'], { type: 'image/png' }), 'room.png')
    await api.upload('/listings/l1/photos/', form)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/listings/l1/photos/')
    expect(init.body).toBe(form)
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.headers.Authorization).toBe('Bearer old-token')
  })

  it('asks for CSV but also accepts JSON errors (otherwise the API answers 406)', async () => {
    fetchMock.mockResolvedValue(
      new Response('Date,Amount\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }),
    )
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    await download('/reports/monthly.csv', { period: '2026-10' }, 'm.csv')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/reports/monthly.csv?period=2026-10')
    expect(init.headers.Accept).toContain('application/json')
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })
})
