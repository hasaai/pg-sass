import type { ReactNode } from 'react'

import { NoAccess } from '../../components/common'
import { useSession } from '../../demo/session'

/** Shows the page only to people with the permission. */
export function NoAccessGuard({
  perm,
  what,
  children,
}: {
  perm: string
  what: string
  children: ReactNode
}) {
  const { can } = useSession()
  return can(perm) ? children : <NoAccess what={what} />
}
