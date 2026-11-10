/**
 * Thin fetch wrapper for the Django API.
 *
 * - The access token lives only in memory (never localStorage).
 * - The refresh token is an httpOnly cookie the browser sends to /api/v1/auth/.
 * - On a 401 we refresh once (shared by concurrent requests) and retry.
 * - Every error becomes an ApiError with the server's { code, message, fields }.
 */

export const API_BASE = '/api/v1'

export type FieldErrors = Record<string, string[] | string | Record<string, unknown>[]>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: FieldErrors

  constructor(status: number, code: string, message: string, fields: FieldErrors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }

  /** First message for one form field, if the server rejected it. */
  fieldError(name: string): string | undefined {
    const value = this.fields[name]
    if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined
    return typeof value === 'string' ? value : undefined
  }
}

let accessToken: string | null = null
let organizationId: string | null = null
let refreshing: Promise<boolean> | null = null
let onAuthLost: (() => void) | null = null

export const session = {
  setAccessToken(token: string | null) {
    accessToken = token
  },
  hasAccessToken() {
    return accessToken !== null
  },
  setOrganization(id: string | null) {
    organizationId = id
  },
  onAuthLost(handler: (() => void) | null) {
    onAuthLost = handler
  },
}

type Query = Record<string, string | number | boolean | null | undefined>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Query
  headers?: Record<string, string>
  /** Internal: do not try to refresh on 401 (auth endpoints, retries). */
  skipRefresh?: boolean
  /** Return the raw body as a Blob (file downloads). */
  blob?: boolean
}

export function buildUrl(path: string, query?: Query): string {
  const url = path.startsWith('/api/') ? path : `${API_BASE}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function parseError(response: Response): Promise<ApiError> {
  let code = 'error'
  let message = `Request failed (${response.status}).`
  let fields: FieldErrors = {}
  try {
    const data = await response.json()
    if (data?.error) {
      code = data.error.code ?? code
      message = data.error.message ?? message
      fields = data.error.fields ?? {}
    }
  } catch {
    // not JSON (proxy error page, etc.)
  }
  if (response.status >= 500) message = 'The server had a problem. Please try again.'
  return new ApiError(response.status, code, message, fields)
}

async function refreshAccessToken(): Promise<boolean> {
  // Concurrent 401s share one refresh call; the slot frees as soon as it settles.
  refreshing ??= (async () => {
    try {
      const response = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!response.ok) return false
      const data = (await response.json()) as { access: string }
      accessToken = data.access
      return true
    } catch {
      return false
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, headers = {}, skipRefresh = false, blob = false } = options
  // FormData (file uploads) sets its own multipart Content-Type with the boundary.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(organizationId ? { 'X-Organization': organizationId } : {}),
      ...headers,
    },
    body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), init)
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection.')
  }

  if (response.status === 401 && !skipRefresh && accessToken !== null) {
    if (await refreshAccessToken()) {
      return request<T>(path, { ...options, skipRefresh: true })
    }
    accessToken = null
    onAuthLost?.()
  }
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  if (blob) return response.blob() as Promise<T>
  const type = response.headers.get('Content-Type') ?? ''
  return (type.includes('application/json') ? response.json() : response.text()) as Promise<T>
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body: body ?? {}, headers }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  /** Replace a whole collection, e.g. a property's amenities. */
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  /** multipart/form-data POST, for photos and documents. */
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  refresh: refreshAccessToken,
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Download a file (e.g. CSV) with the current credentials. */
export async function download(path: string, query: Query, filename: string): Promise<void> {
  // The API renders errors as JSON, so it must be acceptable too (else DRF answers 406).
  const text = await request<string>(path, {
    query,
    headers: { Accept: 'text/csv, application/json;q=0.9' },
  })
  saveBlob(new Blob([text], { type: 'text/csv' }), filename)
}

/** Download a binary file (e.g. a PDF agreement) with the current credentials. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await request<Blob>(path, {
    headers: { Accept: '*/*, application/json;q=0.9' },
    blob: true,
  })
  saveBlob(blob, filename)
}
