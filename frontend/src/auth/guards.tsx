import { Navigate, Outlet, useLocation } from 'react-router'

import { Lock } from 'lucide-react'

import { Spinner } from '../components/ui'
import { EmptyState } from '../components/ui-kit/feedback'
import { useAuth } from './AuthContext'
import { homeFor, safeReturnPath } from './redirects'
import type { Permission, PlatformPermission } from './permissions'

/** Placeholder while we find out who is signed in. */
function Waiting({ label }: { label?: string }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Spinner label={label} />
    </div>
  )
}

/** Only signed-in members of an organization get past this point. */
export function RequireAuth() {
  const { status, membership, user } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Waiting label="Signing you in…" />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (!membership && user?.is_platform_admin) return <Navigate to="/platform" replace />
  if (membership && user && !user.phone_verified) {
    return (
      <Navigate to="/verify-mobile" replace state={{ from: location.pathname + location.search }} />
    )
  }
  // Signed up by mobile but no business yet: finish the profile step (it makes one).
  if (!membership) return <Navigate to="/register/profile" replace />
  return <Outlet />
}

/** Any signed-in account, with or without a business (used for confirming the mobile). */
export function RequireSignedIn() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Waiting label="Signing you in…" />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** Hides manager-only screens from staff (the API also refuses them). */
/** Opens the page only for people with this permission (the API checks it again). */
export function RequirePermission({ perm }: { perm: Permission }) {
  const { can } = useAuth()
  if (!can(perm)) {
    return (
      <EmptyState icon={<Lock />} title="Not available" className="mt-2">
        You do not have access to this page. Ask the business owner.
      </EmptyState>
    )
  }
  return <Outlet />
}

/** Login and sign-up pages send signed-in users straight to the app. */
export function GuestOnly() {
  const { status, membership, user } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Waiting />
  if (status === 'authenticated') {
    // Back to the page that asked for a login (a listing, the app...), else home.
    const from = safeReturnPath((location.state as { from?: unknown } | null)?.from)
    const operatorOnly = from?.startsWith('/app') && !membership
    return (
      <Navigate
        to={
          from && !operatorOnly
            ? from
            : homeFor(Boolean(membership), Boolean(user?.is_platform_admin))
        }
        replace
      />
    )
  }
  return <Outlet />
}

/** Opens a platform page only for team members with this permission (the API checks too). */
export function RequirePlatformPermission({
  perm,
}: {
  perm: PlatformPermission | readonly PlatformPermission[]
}) {
  const { canPlatform } = useAuth()
  if (!canPlatform(perm)) {
    return (
      <EmptyState icon={<Lock />} title="Not part of your role" className="mt-2">
        Your role on the PG Manager team does not include this page. Ask a Platform owner.
      </EmptyState>
    )
  }
  return <Outlet />
}
