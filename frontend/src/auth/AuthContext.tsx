import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api, request, session } from '../api/client'
import type { AuthResponse, Me, MembershipSummary, Role } from '../api/types'
import { makeCan, makePlatformCan } from './permissions'
import type { Permission, PlatformPermission } from './permissions'

const ORG_KEY = 'pg.organization'

type Status = 'loading' | 'authenticated' | 'anonymous'

export interface RegisterInput {
  full_name: string
  email: string
  password: string
  phone: string
  organization_name: string
  contact_phone?: string
}

export interface SeekerInput {
  full_name: string
  email: string
  phone: string
  password: string
}

interface AuthValue {
  status: Status
  user: Me | null
  membership: MembershipSummary | null
  role: Role | null
  /** May this person do this? (convenience only; the API enforces it) */
  can(perm: Permission): boolean
  /** False when this person works only in some properties. */
  allProperties: boolean
  /** May this PG Manager team member do this? (any of a list) */
  canPlatform(perm: PlatformPermission | readonly PlatformPermission[]): boolean
  login(email: string, password: string): Promise<void>
  /** Start a session from a sign-in reply (mobile code sign-up / sign-in). */
  acceptSession(data: AuthResponse): void
  register(input: RegisterInput): Promise<void>
  /** Account for someone looking for a PG (no organization). */
  registerSeeker(input: SeekerInput): Promise<void>
  logout(): Promise<void>
  switchOrganization(id: string): void
  reloadUser(): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function readStoredOrg(): string | null {
  try {
    return localStorage.getItem(ORG_KEY)
  } catch {
    return null
  }
}

function storeOrg(id: string | null) {
  try {
    if (id) localStorage.setItem(ORG_KEY, id)
    else localStorage.removeItem(ORG_KEY)
  } catch {
    // storage unavailable (private mode): selection just isn't remembered
  }
}

function pickMembership(user: Me | null): MembershipSummary | null {
  const memberships = user?.memberships ?? []
  const stored = readStoredOrg()
  return memberships.find((m) => m.organization.id === stored) ?? memberships[0] ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<Me | null>(null)
  const [membership, setMembership] = useState<MembershipSummary | null>(null)

  const applyUser = useCallback((next: Me | null) => {
    const chosen = pickMembership(next)
    session.setOrganization(chosen?.organization.id ?? null)
    setUser(next)
    setMembership(chosen)
    setStatus(next ? 'authenticated' : 'anonymous')
  }, [])

  const clear = useCallback(() => {
    session.setAccessToken(null)
    session.setOrganization(null)
    queryClient.clear()
    applyUser(null)
  }, [applyUser, queryClient])

  useEffect(() => {
    session.onAuthLost(clear)
    let cancelled = false
    ;(async () => {
      const ok = await api.refresh()
      if (cancelled) return
      if (!ok) return applyUser(null)
      try {
        applyUser(await api.get<Me>('/auth/me'))
      } catch {
        if (!cancelled) applyUser(null)
      }
    })()
    return () => {
      cancelled = true
      session.onAuthLost(null)
    }
  }, [applyUser, clear])

  const finishAuth = useCallback(
    (data: AuthResponse) => {
      session.setAccessToken(data.access)
      queryClient.clear()
      applyUser(data.user)
    },
    [applyUser, queryClient],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        skipRefresh: true,
      })
      finishAuth(data)
    },
    [finishAuth],
  )

  const registerSeeker = useCallback(
    async (input: SeekerInput) => {
      const data = await request<AuthResponse>('/auth/register-seeker', {
        method: 'POST',
        body: input,
        skipRefresh: true,
      })
      finishAuth(data)
    },
    [finishAuth],
  )

  const register = useCallback(
    async (input: RegisterInput) => {
      const data = await request<AuthResponse>('/auth/register', {
        method: 'POST',
        body: input,
        skipRefresh: true,
      })
      finishAuth(data)
    },
    [finishAuth],
  )

  const logout = useCallback(async () => {
    try {
      await request<void>('/auth/logout', { method: 'POST', body: {}, skipRefresh: true })
    } finally {
      storeOrg(null)
      clear()
    }
  }, [clear])

  const switchOrganization = useCallback(
    (id: string) => {
      storeOrg(id)
      queryClient.clear()
      applyUser(user)
    },
    [applyUser, queryClient, user],
  )

  const reloadUser = useCallback(async () => {
    applyUser(await api.get<Me>('/auth/me'))
  }, [applyUser])

  const value = useMemo<AuthValue>(() => {
    const role = (membership?.role as Role | undefined) ?? null
    return {
      status,
      user,
      membership,
      role,
      can: makeCan(membership),
      allProperties: membership?.all_properties ?? true,
      canPlatform: makePlatformCan(user),
      login,
      acceptSession: finishAuth,
      register,
      registerSeeker,
      logout,
      switchOrganization,
      reloadUser,
    }
  }, [
    status,
    user,
    membership,
    login,
    finishAuth,
    register,
    registerSeeker,
    logout,
    switchOrganization,
    reloadUser,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
