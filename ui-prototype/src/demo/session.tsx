/** Who the prototype is showing the app as. Switch with the "Viewing as" button. */
import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

import { ROLE_PERMS } from '../data/seed'

export type DemoRole = 'owner' | 'manager' | 'accountant' | 'caretaker' | 'platform' | 'tenant'

// eslint-disable-next-line react-refresh/only-export-components
export const DEMO_PEOPLE: Record<
  DemoRole,
  { name: string; email: string; label: string; home: string }
> = {
  owner: { name: 'Asha Rao', email: 'asha@ashastays.in', label: 'Owner', home: '/app' },
  manager: { name: 'Ravi Kumar', email: 'ravi@ashastays.in', label: 'Manager', home: '/app' },
  accountant: {
    name: 'Kavitha N',
    email: 'accounts@ashastays.in',
    label: 'Accountant',
    home: '/app',
  },
  caretaker: { name: 'Basavaraj', email: '', label: 'Caretaker', home: '/app' },
  platform: {
    name: 'San (Founder)',
    email: 'san@pgmanager.in',
    label: 'PG Manager team',
    home: '/platform',
  },
  tenant: {
    name: 'Priya Sharma',
    email: 'priya.sharma@gmail.com',
    label: 'Tenant',
    home: '/tenant',
  },
}

interface Session {
  role: DemoRole
  setRole: (r: DemoRole) => void
  person: (typeof DEMO_PEOPLE)[DemoRole]
  /** Business permissions (see seed.ts PERMISSIONS). The owner can do everything. */
  can: (perm: string) => boolean
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<DemoRole>('owner')
  const perms = new Set(ROLE_PERMS[role] ?? [])
  const value: Session = {
    role,
    setRole,
    person: DEMO_PEOPLE[role],
    can: (perm) => role === 'owner' || perms.has(perm),
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): Session {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession needs SessionProvider')
  return s
}
